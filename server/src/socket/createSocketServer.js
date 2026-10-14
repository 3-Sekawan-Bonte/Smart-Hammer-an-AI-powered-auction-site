const { Server } = require('socket.io');
const { verifyAccessToken } = require('../utils/verifyAccessToken');
const { createAuctionService } = require('../services/auctionService');
const { auctionToJSON } = require('../utils/auctionSerializer');

function ackError(ack, code, message) {
  if (typeof ack === 'function') ack({ ok: false, error: { code, message } });
}

function validPayload(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    && Object.keys(payload).length === 1
    && Number.isSafeInteger(payload.auctionId) && payload.auctionId > 0;
}

function createSocketServer(httpServer, dependencies, options = {}) {
  const { User, Auction, Bid } = dependencies;
  const io = new Server(httpServer, options);
  const auctionService = createAuctionService(dependencies);

  io.use(async (socket, next) => {
    try {
      const id = verifyAccessToken(socket.handshake.auth?.token, options.env || process.env);
      const user = await User.findByPk(id);
      if (!user) throw new Error('Unauthorized');
      socket.data.user = { id: user.id };
      return next();
    } catch (_error) {
      const error = new Error('Authentication is required.');
      error.data = { code: 'UNAUTHORIZED', message: 'Authentication is required.' };
      return next(error);
    }
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {
      delete socket.data.user;
    });

    socket.on('auction:join', async (payload, ack) => {
      if (!validPayload(payload)) return ackError(ack, 'VALIDATION_ERROR', 'A positive integer auctionId is required.');
      const room = `auction:${payload.auctionId}`;
      try {
        await auctionService.getById(payload.auctionId, socket.data.user.id);
        await socket.join(room);
        // Re-read after joining so changes during access validation are either
        // delivered to this room or included in its authoritative snapshot.
        const auction = await auctionService.getById(payload.auctionId, socket.data.user.id);
        const { count, rows } = await Bid.findAndCountAll({
          where: { auctionId: payload.auctionId },
          include: [{ model: User, as: 'bidder', attributes: ['id', 'username'] }],
          order: [['createdAt', 'DESC'], ['id', 'DESC']],
          limit: 10,
          offset: 0,
        });
        const state = auctionToJSON(auction);
        socket.emit('auction:snapshot', {
          auctionId: state.id,
          version: state.version,
          serverNow: new Date().toISOString(),
          data: {
            auction: state,
            bids: rows.map((bid) => {
              const value = typeof bid.toJSON === 'function' ? bid.toJSON() : bid;
              return {
                id: value.id,
                auctionId: value.auctionId,
                userId: value.userId,
                amount: value.amount,
                createdAt: new Date(value.createdAt).toISOString(),
                bidder: value.bidder ? { id: value.bidder.id, username: value.bidder.username } : null,
              };
            }),
            meta: { page: 1, limit: 10, total: count, totalPages: Math.ceil(count / 10) },
          },
        });
        if (typeof ack === 'function') ack({ ok: true, data: { auctionId: payload.auctionId } });
      } catch (error) {
        try { await socket.leave(room); } catch (_leaveError) { /* Socket.IO cleans membership on disconnect. */ }
        ackError(ack, error.status === 404 ? 'NOT_FOUND' : 'SOCKET_OPERATION_FAILED',
          error.status === 404 ? 'Auction was not found.' : 'Unable to join this auction.');
      }
    });

    socket.on('auction:leave', async (payload, ack) => {
      if (!validPayload(payload)) return ackError(ack, 'VALIDATION_ERROR', 'A positive integer auctionId is required.');
      try {
        await socket.leave(`auction:${payload.auctionId}`);
        if (typeof ack === 'function') ack({ ok: true, data: { auctionId: payload.auctionId } });
      } catch (_error) {
        ackError(ack, 'SOCKET_OPERATION_FAILED', 'Unable to leave this auction.');
      }
    });
  });

  return io;
}

module.exports = { createSocketServer, validPayload };
