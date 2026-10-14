import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { getApiData, getApiError } from '../../lib/api.js';
import { auctionFieldsConflict, isValidEvent, mergeBids, mergePublicInteractions, sameId, validateSnapshot } from './auctionRoom.js';
import { estimateServerOffset } from './serverClock.js';

const initialState = {
  catalog: {
    auctions: [],
    meta: { currentPage: 1, limit: 10, totalData: 0, totalPages: 0 },
    page: 1,
    loading: false,
    error: null,
  },
  create: {
    status: 'idle',
    error: null,
  },
  edit: { status: 'idle', error: null },
  start: { status: 'idle', error: null },
  active: {
    auction: null,
    bids: [],
    publicAIInteractions: [],
    participants: [],
    loading: false,
    error: null,
    submitStatus: 'idle',
    version: 0,
    serverNow: null,
    serverTimeOffsetMs: 0,
    bidsMeta: null,
    aiMeta: null,
    resyncRequired: false,
    resyncReason: null,
    bidsRequestId: null,
    aiRequestId: null,
    currentId: null,
    requestId: null,
  },
};

const fixtureImagePositions = {
  7: '50% 100%',
  12: '0% 0%',
  13: '50% 0%',
  14: '100% 0%',
  15: '50% 100%',
  16: '100% 100%',
  17: '0% 0%',
};

function toAuctionCard(item) {
  return {
    ...item,
    category: item.category || 'electronics',
    price: Number(item.currentPrice ?? item.startingPrice ?? 0),
    bids: Number(item.bidCount ?? 0),
    time: remainingTime(item.endsAt),
    seller: item.seller || { id: item.sellerId ?? null, username: 'seller.smart-hammer' },
    sellerName: (typeof item.seller === 'object' ? item.seller?.username : item.seller) || 'seller.smart-hammer',
    visualPosition: item.visualPosition || fixtureImagePositions[item.id] || '50% 50%',
  };
}

function requestError(error, fallback) {
  const apiError = error.response?.data?.error;
  return {
    message: getApiError(error, fallback),
    code: apiError?.code || null,
    fields: apiError?.fields || {},
  };
}

function remainingTime(endsAt) {
  if (!endsAt) return '00:00';
  const totalSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}j ${String(minutes).padStart(2, '0')}m`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const loadAuctions = createAsyncThunk(
  'auction/loadAuctions',
  async ({ page = 1, limit = 10 } = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/auctions', { params: { page, limit } });
      const auctions = getApiData(response);
      if (!Array.isArray(auctions)) throw new Error('Format respons daftar lelang tidak valid.');
      return { auctions: auctions.map(toAuctionCard), meta: response.data?.meta || { currentPage: page, limit, totalData: auctions.length, totalPages: 1 } };
    } catch (error) {
      return rejectWithValue(getApiError(error, error.message || 'Daftar lelang gagal dimuat.'));
    }
  }
);

export const createAuction = createAsyncThunk(
  'auction/createAuction',
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post('/auctions', payload);
      const result = getApiData(response);
      return toAuctionCard(result.auction ?? result);
    } catch (error) {
      return rejectWithValue(requestError(error, 'Lelang gagal disimpan. Periksa data dan coba lagi.'));
    }
  }
);

export const updateAuction = createAsyncThunk(
  'auction/updateAuction',
  async ({ auctionId, payload }, { rejectWithValue }) => {
    try {
      const response = await api.patch(`/auctions/${auctionId}`, payload);
      const result = getApiData(response);
      return toAuctionCard(result.auction ?? result);
    } catch (error) {
      return rejectWithValue(requestError(error, 'Draft gagal diperbarui. Periksa data dan coba lagi.'));
    }
  }
);

export const startAuction = createAsyncThunk(
  'auction/startAuction',
  async (auctionId, { rejectWithValue }) => {
    try {
      const response = await api.post(`/auctions/${auctionId}/start`);
      const result = getApiData(response);
      return toAuctionCard(result.auction ?? result);
    } catch (error) {
      return rejectWithValue(requestError(error, 'Lelang gagal dimulai. Muat ulang dan coba lagi.'));
    }
  }
);

export const loadAuctionSnapshot = createAsyncThunk(
  'auction/loadAuctionSnapshot',
  async (auctionId, { rejectWithValue, signal }) => {
    try {
      if (!/^[1-9]\d*$/.test(String(auctionId ?? ''))) return rejectWithValue('ID lelang tidak valid.');
      const localSentAt = Date.now();
      const response = await api.get(`/auctions/${auctionId}`, { signal });
      return { ...validateSnapshot(getApiData(response), auctionId), localSentAt, localReceivedAt: Date.now() };
    } catch (error) {
      return rejectWithValue(getApiError(error, 'Gagal memuat detail lelang.'));
    }
  }
);

export const submitBid = createAsyncThunk(
  'auction/submitBid',
  async ({ auctionId, amount, clientRequestId }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/auctions/${auctionId}/bids`, {
        amount,
        clientRequestId,
      });
      const result = getApiData(response);
      if (!result?.auction || !result?.bid || String(result.auction.id) !== String(auctionId) ||
          String(result.bid.auctionId) !== String(auctionId) || result.clientRequestId !== clientRequestId ||
          !Number.isSafeInteger(result.auction.version) || !Number.isSafeInteger(result.bid.id)) {
        return rejectWithValue({ code: 'INVALID_RESPONSE', message: 'Server mengembalikan konfirmasi bid yang tidak valid.', uncertain: true });
      }
      return result;
    } catch (error) {
      const apiError = error.response?.data?.error;
      return rejectWithValue({
        code: apiError?.code || null,
        status: error.response?.status || null,
        message: getApiError(error, 'Bid gagal dikirim.'),
        fields: apiError?.fields || {},
        details: apiError?.details || {},
        uncertain: !error.response || error.response.status >= 500,
      });
    }
  }
);

export const askAI = createAsyncThunk(
  'auction/askAI',
  async ({ auctionId, question }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/auctions/${auctionId}/ai/questions`, { question });
      return { ...getApiData(response), auctionId: String(auctionId) };
    } catch (error) {
      return rejectWithValue({
        status: error.response?.status || null,
        code: error.response?.data?.error?.code || null,
        message: error.response?.data?.message || 'Gagal mengirim pertanyaan ke AI.',
        retryAfterSeconds: Number(error.response?.data?.error?.details?.retryAfterSeconds || error.response?.headers?.['retry-after'] || 0),
      });
    }
  }
);

export const loadAIInteractions = createAsyncThunk(
  'auction/loadAIInteractions',
  async ({ auctionId, page = 1, limit = 20 } = {}, { rejectWithValue }) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/ai/interactions`, { params: { page, limit } });
      const result = getApiData(response);
      const interactions = Array.isArray(result) ? result : result?.aiInteractions;
      if (!Array.isArray(interactions)) throw new Error('Format riwayat AI tidak valid.');
      return { interactions, meta: response.data?.meta || result?.meta || null, auctionId: String(auctionId), page };
    } catch (error) {
      return rejectWithValue('Gagal memuat riwayat AI.');
    }
  }
);

export const loadBids = createAsyncThunk(
  'auction/loadBids',
  async ({ auctionId, page = 1, limit = 20 }, { rejectWithValue }) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/bids`, { params: { page, limit } });
      const result = getApiData(response);
      const bids = Array.isArray(result) ? result : result?.bids;
      if (!Array.isArray(bids)) throw new Error('Format riwayat bid tidak valid.');
      return { bids, meta: response.data?.meta || result?.meta || null, auctionId: String(auctionId), page };
    } catch (error) {
      return rejectWithValue('Gagal memuat riwayat bid.');
    }
  }
);

export const processAuctionEvent = (eventName, payload) => (dispatch, getState) => {
  const actions = {
    'auction:snapshot': auctionSnapshotReceived,
    'auction:started': auctionStarted,
    'bid:updated': bidReceived,
    'auction:ended': auctionEnded,
    'ai:pending': aiPending,
    'ai:message': aiReceived,
    'ai:error': aiFailed,
  };
  const actionCreator = actions[eventName];
  if (!actionCreator) return null;
  dispatch(actionCreator(payload));
  const { active } = getState().auction;
  if (active.resyncRequired && active.currentId && !active.requestId) return dispatch(loadAuctionSnapshot(active.currentId));
  return null;
};

function applySnapshot(active, snapshot, toCard) {
  let checked;
  try { checked = validateSnapshot(snapshot, snapshot?.auction?.id); }
  catch { active.resyncRequired = true; active.resyncReason = 'Snapshot lelang tidak valid.'; return; }
  const { auction, bids, aiInteractions, serverNow, bidsMeta, aiMeta } = checked;
  if (active.currentId && !sameId(active.currentId, auction.id)) return;
  const incomingVersion = Number(auction.version);
  if (active.auction && incomingVersion < active.version) {
    active.loading = false;
    active.error = null;
    return;
  }
  if (active.auction && incomingVersion === active.version && auctionFieldsConflict(active.auction, auction)) {
    active.loading = false;
    active.resyncRequired = true;
    active.resyncReason = 'Snapshot dengan versi sama berisi state berbeda.';
    return;
  }
  const newer = !active.auction || incomingVersion > active.version;
  if (newer) active.auction = toCard(auction);
  active.currentId = String(auction.id);
  active.version = newer ? incomingVersion : active.version;
  active.bids = mergeBids(active.bids, bids, auction.id);
  active.publicAIInteractions = mergePublicInteractions(active.publicAIInteractions, aiInteractions, auction.id);
  active.bidsMeta = bidsMeta ?? active.bidsMeta;
  active.aiMeta = aiMeta ?? active.aiMeta;
  active.participants = Array.isArray(checked.participants) ? checked.participants : active.participants;
  active.serverNow = serverNow || active.serverNow;
  const estimatedOffset = estimateServerOffset(serverNow, snapshot.localSentAt ?? Date.now(), snapshot.localReceivedAt ?? Date.now());
  active.serverTimeOffsetMs = estimatedOffset ?? active.serverTimeOffsetMs;
  active.loading = false;
  active.error = null;
  active.resyncRequired = false;
  active.resyncReason = null;
}

function applyIncremental(active, payload, toCard) {
  if (!active.auction) return;
  const payloadAuctionId = payload?.auctionId ?? payload?.bid?.auctionId ?? payload?.interaction?.auctionId ?? payload?.auction?.id;
  if (!sameId(payloadAuctionId, active.currentId)) return;
  if (!isValidEvent(payload, active.currentId)) {
    active.resyncRequired = true;
    active.resyncReason = 'Event lelang tidak valid atau versi payload tidak konsisten.';
    return;
  }
  const incoming = payload.auction;
  const version = Number(incoming.version);
  if (version < active.version) return;
  if (version === active.version) {
    if (auctionFieldsConflict(active.auction, incoming)) {
      active.resyncRequired = true;
      active.resyncReason = 'Event dengan versi sama berisi state berbeda.';
      return;
    }
    mergeEventCollections(active, payload);
    return;
  }
  if (version !== active.version + 1) {
    active.resyncRequired = true;
    active.resyncReason = `Versi lelang meloncat dari ${active.version} ke ${version}.`;
    return;
  }
  const lifecycleRank = { draft: 0, live: 1, ended: 2 };
  if ((lifecycleRank[incoming.status] ?? -1) < (lifecycleRank[active.auction.status] ?? -1)) {
    active.resyncRequired = true;
    active.resyncReason = 'Event lelang mencoba memundurkan status lifecycle.';
    return;
  }
  active.auction = toCard(incoming);
  active.version = version;
  active.serverNow = payload.serverNow || active.serverNow;
  const estimatedOffset = estimateServerOffset(payload.serverNow, Date.now(), Date.now());
  active.serverTimeOffsetMs = estimatedOffset ?? active.serverTimeOffsetMs;
  mergeEventCollections(active, payload);
  active.resyncRequired = false;
  active.resyncReason = null;
}

function mergeEventCollections(active, payload) {
  const auctionId = active.currentId;
  const bids = payload.bids || (payload.bid ? [payload.bid] : []);
  if (Array.isArray(bids)) {
    active.bids = mergeBids(active.bids, bids, auctionId);
    if ((Array.isArray(payload.bids) || payload.bid) && Number.isSafeInteger(payload.auction?.bidCount)) {
      const limit = active.bidsMeta?.limit || 20;
      active.bidsMeta = {
        currentPage: active.bidsMeta?.currentPage || 1,
        limit,
        totalData: payload.auction.bidCount,
        totalPages: Math.ceil(payload.auction.bidCount / limit),
      };
    }
  }
  const interactions = payload.aiInteractions || (payload.interaction ? [payload.interaction] : []);
  if (Array.isArray(interactions)) active.publicAIInteractions = mergePublicInteractions(active.publicAIInteractions, interactions, auctionId);
}

function applyAI(active, interaction) {
  if (!interaction || !active.auction || !sameId(interaction.auctionId, active.currentId)) return;
  active.publicAIInteractions = mergePublicInteractions(active.publicAIInteractions, [interaction], active.currentId);
}

function applyMutationAuction(active, auction) {
  if (!active.auction || !sameId(active.currentId, auction?.id)) return;
  const version = Number(auction.version);
  if (!Number.isSafeInteger(version) || version < active.version) return;
  if (version === active.version && auctionFieldsConflict(active.auction, auction)) {
    active.resyncRequired = true;
    active.resyncReason = 'Respons mutation berbeda pada versi lelang yang sama.';
    return;
  }
  if (active.auction.status === 'ended' && auction.status !== 'ended') return;
  active.auction = toAuctionCard(auction);
  active.version = version;
}

const auctionSlice = createSlice({
  name: 'auction',
  initialState,
  reducers: {
    auctionSnapshotReceived(state, action) {
      applySnapshot(state.active, action.payload, toAuctionCard);
    },
    auctionStarted(state, action) {
      applyIncremental(state.active, action.payload, toAuctionCard);
    },
    bidReceived(state, action) {
      applyIncremental(state.active, action.payload, toAuctionCard);
      if (sameId(state.active.currentId, action.payload?.auctionId ?? action.payload?.auction?.id)) state.active.submitStatus = 'success';
    },
    auctionEnded(state, action) {
      applyIncremental(state.active, action.payload, toAuctionCard);
    },
    aiPending(state, action) {
      applyAI(state.active, action.payload?.interaction || action.payload);
    },
    aiReceived(state, action) {
      applyAI(state.active, action.payload?.interaction || action.payload);
    },
    aiFailed(state, action) {
      applyAI(state.active, action.payload?.interaction || action.payload);
    },
    presenceReceived(state, action) {
      if (Array.isArray(action.payload) && action.payload.every((item) => item && typeof item === 'object')) state.active.participants = action.payload;
    },
    roomReset(state) { state.active = { ...initialState.active }; },
    resyncRequested(state, action) {
      state.active.resyncRequired = true;
      state.active.resyncReason = typeof action.payload === 'string' ? action.payload : action.payload?.reason || 'State lelang perlu disinkronkan.';
    },
    submitBidStart(state) {
      state.active.submitStatus = 'loading';
      state.active.error = null;
    },
    submitBidFailed(state, action) {
      state.active.submitStatus = 'error';
      state.active.error = action.payload;
    },
    clearActiveAuction(state) {
      state.active = { ...initialState.active };
    },
    clearCatalogError(state) {
      state.catalog.error = null;
    },
    resetEditStatus(state) {
      state.edit = { status: 'idle', error: null };
    },
    resetStartStatus(state) {
      state.start = { status: 'idle', error: null };
    },
    resetCreateStatus(state) {
      state.create.status = 'idle';
      state.create.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAuctions.pending, (state) => {
        state.catalog.loading = true;
        state.catalog.error = null;
      })
      .addCase(loadAuctions.fulfilled, (state, action) => {
        state.catalog.loading = false;
        state.catalog.auctions = action.payload.auctions;
        state.catalog.meta = action.payload.meta;
        state.catalog.page = action.payload.meta.currentPage;
        state.catalog.error = null;
      })
      .addCase(loadAuctions.rejected, (state, action) => {
        state.catalog.loading = false;
        state.catalog.error = action.payload;
      })
      .addCase(createAuction.pending, (state) => {
        state.create.status = 'loading';
        state.create.error = null;
      })
      .addCase(createAuction.fulfilled, (state, action) => {
        state.create.status = 'success';
      })
      .addCase(createAuction.rejected, (state, action) => {
        state.create.status = 'error';
        state.create.error = action.payload;
      })
      .addCase(updateAuction.pending, (state) => {
        state.edit.status = 'loading';
        state.edit.error = null;
      })
      .addCase(updateAuction.fulfilled, (state, action) => {
        state.edit.status = 'success';
        applyMutationAuction(state.active, action.payload);
      })
      .addCase(updateAuction.rejected, (state, action) => {
        state.edit.status = 'error';
        state.edit.error = action.payload;
      })
      .addCase(startAuction.pending, (state) => {
        state.start.status = 'loading';
        state.start.error = null;
      })
      .addCase(startAuction.fulfilled, (state, action) => {
        state.start.status = 'success';
        applyMutationAuction(state.active, action.payload);
      })
      .addCase(startAuction.rejected, (state, action) => {
        state.start.status = 'error';
        state.start.error = action.payload;
      })
      .addCase(loadAuctionSnapshot.pending, (state, action) => {
        state.active.loading = true;
        state.active.error = null;
        const switching = !sameId(state.active.currentId, action.meta.arg);
        if (switching) {
          state.active.auction = null;
          state.active.bids = [];
          state.active.publicAIInteractions = [];
          state.active.participants = [];
          state.active.version = 0;
          state.active.serverNow = null;
          state.active.serverTimeOffsetMs = 0;
          state.active.bidsMeta = null;
          state.active.aiMeta = null;
          state.active.bidsRequestId = null;
          state.active.aiRequestId = null;
          state.active.submitStatus = 'idle';
          state.active.resyncRequired = false;
          state.active.resyncReason = null;
        }
        state.active.currentId = String(action.meta.arg);
        state.active.requestId = action.meta.requestId;
      })
      .addCase(loadAuctionSnapshot.fulfilled, (state, action) => {
        if (state.active.requestId !== action.meta.requestId) return;
        applySnapshot(state.active, action.payload, toAuctionCard);
        state.active.requestId = null;
      })
      .addCase(loadAuctionSnapshot.rejected, (state, action) => {
        if (state.active.requestId !== action.meta.requestId) return;
        state.active.loading = false;
        state.active.error = action.meta.aborted ? null : action.payload;
        state.active.requestId = null;
      })
      .addCase(submitBid.pending, (state) => {
        state.active.submitStatus = 'loading';
        state.active.error = null;
      })
      .addCase(submitBid.fulfilled, (state, action) => {
        if (!sameId(state.active.currentId, action.meta.arg.auctionId)) return;
        state.active.submitStatus = 'success';
        if (action.payload?.auction && action.payload?.bid) applyIncremental(state.active, action.payload, toAuctionCard);
        else if (state.active.auction) {
          state.active.resyncRequired = true;
          state.active.resyncReason = 'Respons bid tidak menyertakan state lelang authoritative.';
        }
      })
      .addCase(submitBid.rejected, (state, action) => {
        if (!sameId(state.active.currentId, action.meta.arg.auctionId)) return;
        state.active.submitStatus = 'error';
        state.active.error = action.payload;
      })
      .addCase(askAI.pending, (state) => {
        // AI pending is handled by socket event
      })
      .addCase(askAI.fulfilled, (state, action) => {
        const interaction = action.payload?.interaction;
        if (sameId(state.active.currentId, action.payload?.auctionId) && interaction) {
          state.active.publicAIInteractions = mergePublicInteractions(state.active.publicAIInteractions, [interaction], state.active.currentId);
        }
      })
      .addCase(askAI.rejected, (state, action) => {
        // Error handled in component
      })
      .addCase(loadAIInteractions.pending, (state, action) => {
        if (sameId(state.active.currentId, action.meta.arg)) state.active.aiRequestId = action.meta.requestId;
      })
      .addCase(loadAIInteractions.fulfilled, (state, action) => {
        if (!sameId(state.active.currentId, action.payload.auctionId) || state.active.aiRequestId !== action.meta.requestId) return;
        state.active.publicAIInteractions = mergePublicInteractions(state.active.publicAIInteractions, action.payload.interactions, state.active.currentId);
        state.active.aiMeta = action.payload.meta;
        state.active.aiRequestId = null;
      })
      .addCase(loadAIInteractions.rejected, (state, action) => {
        if (state.active.aiRequestId === action.meta.requestId) state.active.aiRequestId = null;
      })
      .addCase(loadBids.pending, (state, action) => {
        if (sameId(state.active.currentId, action.meta.arg.auctionId)) state.active.bidsRequestId = action.meta.requestId;
      })
      .addCase(loadBids.fulfilled, (state, action) => {
        if (!sameId(state.active.currentId, action.payload.auctionId) || state.active.bidsRequestId !== action.meta.requestId) return;
        state.active.bids = mergeBids(state.active.bids, action.payload.bids, state.active.currentId);
        state.active.bidsMeta = action.payload.meta;
        state.active.bidsRequestId = null;
      })
      .addCase(loadBids.rejected, (state, action) => {
        if (state.active.bidsRequestId === action.meta.requestId) state.active.bidsRequestId = null;
      })
      .addCase('auth/logout', (state) => {
        state.catalog.auctions = [];
        state.catalog.meta = initialState.catalog.meta;
        state.catalog.page = 1;
        state.catalog.error = null;
        state.active = { ...initialState.active, loading: false };
        state.create = { ...initialState.create };
        state.edit = { ...initialState.edit };
        state.start = { ...initialState.start };
      })
      .addCase('auth/login/fulfilled', (state) => { state.active = { ...initialState.active }; })
      .addCase('auth/restoreSession/fulfilled', (state) => { state.active = { ...initialState.active }; });
  },
});

export const {
  auctionSnapshotReceived,
  auctionStarted,
  bidReceived,
  auctionEnded,
  aiPending,
  aiReceived,
  aiFailed,
  presenceReceived,
  submitBidStart,
  submitBidFailed,
  clearActiveAuction,
  roomReset,
  resyncRequested,
  clearCatalogError,
  resetCreateStatus,
} = auctionSlice.actions;

export const selectCatalogAuctions = (state) => state.auction.catalog.auctions;
export const selectCatalogMeta = (state) => state.auction.catalog.meta;
export const selectCatalogLoading = (state) => state.auction.catalog.loading;
export const selectCatalogError = (state) => state.auction.catalog.error;
export const selectCreateStatus = (state) => state.auction.create.status;
export const selectCreateError = (state) => state.auction.create.error;
export const selectEditStatus = (state) => state.auction.edit.status;
export const selectEditError = (state) => state.auction.edit.error;
export const selectStartStatus = (state) => state.auction.start.status;
export const selectStartError = (state) => state.auction.start.error;

export const selectActiveAuction = (state) => state.auction.active.auction;
export const selectActiveBids = (state) => state.auction.active.bids;
export const selectActiveAIInteractions = (state) => state.auction.active.publicAIInteractions;
export const selectActiveParticipants = (state) => state.auction.active.participants;
export const selectActiveLoading = (state) => state.auction.active.loading;
export const selectActiveError = (state) => state.auction.active.error;
export const selectActiveId = (state) => state.auction.active.currentId;
export const selectSubmitStatus = (state) => state.auction.active.submitStatus;
export const selectActiveVersion = (state) => state.auction.active.version;
export const selectServerNow = (state) => state.auction.active.serverNow;
export const selectServerTimeOffsetMs = (state) => state.auction.active.serverTimeOffsetMs;
export const selectActiveResyncRequired = (state) => state.auction.active.resyncRequired;
export const selectActiveResyncReason = (state) => state.auction.active.resyncReason;
export const selectActiveBidsMeta = (state) => state.auction.active.bidsMeta;
export const selectActiveBidsRequestId = (state) => state.auction.active.bidsRequestId;
export const selectActiveAIMeta = (state) => state.auction.active.aiMeta;
export const selectCurrentPrice = (state) => state.auction.active.auction?.currentPrice ?? null;
export const selectNextMinimumBid = (state) => state.auction.active.auction?.nextMinimumBid ?? null;
export const selectAuctionStatus = (state) => state.auction.active.auction?.status ?? null;
export const selectAuctionBidCount = (state) => state.auction.active.auction?.bidCount ?? 0;
export const selectHighestBidder = (state) => state.auction.active.auction?.highestBidder ?? null;
export const selectAuctionDeadline = (state) => state.auction.active.auction?.endsAt ?? null;
export const selectAuctionWinner = (state) => state.auction.active.auction?.winner ?? null;
export const selectAuctionLoading = selectActiveLoading;
export const selectAuctionError = selectActiveError;
export const selectAuctionRoom = (state) => state.auction.active;

export default auctionSlice.reducer;
