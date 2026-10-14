import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api, { getApiData, getApiError } from '../../lib/api.js';

const initialState = {
  catalog: {
    auctions: [],
    loading: false,
    error: null,
  },
  create: {
    status: 'idle',
    error: null,
  },
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
  const seller = typeof item.seller === 'object' ? item.seller?.username : item.seller;
  return {
    ...item,
    category: item.category || 'electronics',
    price: Number(item.currentPrice ?? item.startingPrice ?? 0),
    bids: Number(item.bidCount ?? 0),
    time: remainingTime(item.endsAt),
    seller: seller || 'seller.smart-hammer',
    visualPosition: item.visualPosition || fixtureImagePositions[item.id] || '50% 50%',
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

function dedupe(items, id) {
  return items.some((item) => item.id === id);
}

export const loadAuctions = createAsyncThunk(
  'auction/loadAuctions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/auctions');
      const auctions = getApiData(response);
      if (!Array.isArray(auctions)) throw new Error('Format respons daftar lelang tidak valid.');
      return auctions.map(toAuctionCard);
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
      return rejectWithValue(getApiError(error, 'Lelang gagal disimpan. Periksa data dan coba lagi.'));
    }
  }
);

export const loadAuctionSnapshot = createAsyncThunk(
  'auction/loadAuctionSnapshot',
  async (auctionId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(`/auctions/${auctionId}`, { signal });
      const snapshot = getApiData(response);
      if (!snapshot?.auction) throw new Error('Format snapshot lelang tidak valid.');
      return snapshot;
    } catch (error) {
      return rejectWithValue(getApiError(error, 'Gagal memuat detail lelang.'));
    }
  }
);

export const submitBid = createAsyncThunk(
  'auction/submitBid',
  async ({ auctionId, amount, clientRequestId }, { rejectWithValue, getState }) => {
    try {
      const response = await api.post(`/auctions/${auctionId}/bids`, {
        amount,
        clientRequestId,
      });
      return getApiData(response);
    } catch (error) {
      if (error.response?.status === 409) {
        return rejectWithValue({ code: 'CONFLICT', message: error.response.data?.error?.message || 'Bid gagal, coba lagi.' });
      }
      return rejectWithValue(error.response?.data?.error?.message || 'Bid gagal dikirim.');
    }
  }
);

export const askAI = createAsyncThunk(
  'auction/askAI',
  async ({ auctionId, question }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/auctions/${auctionId}/ai/questions`, { question });
      return getApiData(response);
    } catch (error) {
      return rejectWithValue(error.response?.data?.error?.message || 'Gagal mengirim pertanyaan ke AI.');
    }
  }
);

export const loadAIInteractions = createAsyncThunk(
  'auction/loadAIInteractions',
  async (auctionId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/ai/interactions`);
      return getApiData(response);
    } catch (error) {
      return rejectWithValue('Gagal memuat riwayat AI.');
    }
  }
);

export const loadBids = createAsyncThunk(
  'auction/loadBids',
  async (auctionId, { rejectWithValue }) => {
    try {
      const response = await api.get(`/auctions/${auctionId}/bids`);
      return getApiData(response);
    } catch (error) {
      return rejectWithValue('Gagal memuat riwayat bid.');
    }
  }
);

const auctionSlice = createSlice({
  name: 'auction',
  initialState,
  reducers: {
    auctionSnapshotReceived(state, action) {
      const { auction, bids, aiInteractions, participants, serverNow, version } = action.payload;
      const incomingVersion = version ?? auction?.version ?? 0;
      if (state.active.auction && state.active.version > incomingVersion) {
        return;
      }
      state.active.auction = auction ? {
        ...auction,
        price: auction.currentPrice ?? auction.startingPrice ?? 0,
        bids: auction.bidCount ?? bids?.length ?? 0,
        time: remainingTime(auction.endsAt),
        visualPosition: auction.visualPosition || fixtureImagePositions[auction.id] || '50% 50%',
      } : null;
      state.active.bids = bids || [];
      state.active.publicAIInteractions = aiInteractions || [];
      state.active.participants = participants || [];
      state.active.version = incomingVersion;
      state.active.serverNow = serverNow;
      state.active.loading = false;
      state.active.error = null;
    },
    auctionStarted(state, action) {
      const { auction, version, serverNow } = action.payload;
      if (state.active.auction && state.active.version > version) return;
      state.active.auction = {
        ...state.active.auction,
        ...auction,
        status: 'live',
        price: auction.currentPrice ?? auction.startingPrice ?? 0,
        time: remainingTime(auction.endsAt),
      };
      state.active.version = version;
      state.active.serverNow = serverNow;
    },
    bidReceived(state, action) {
      const bid = action.payload;
      if (dedupe(state.active.bids, bid.id)) {
        state.active.submitStatus = 'success';
        return;
      }
      if (state.active.auction) {
        state.active.auction = {
          ...state.active.auction,
          currentPrice: bid.amount,
          price: bid.amount,
          version: state.active.version + 1,
          endsAt: bid.endsAt || state.active.auction.endsAt,
          highestBidderId: bid.userId,
        };
      }
      state.active.bids = [bid, ...state.active.bids];
      state.active.version += 1;
      state.active.submitStatus = 'success';
    },
    auctionEnded(state, action) {
      const { auction, winnerId, finalPrice, version, serverNow } = action.payload;
      if (state.active.auction && state.active.version > version) return;
      state.active.auction = {
        ...state.active.auction,
        ...auction,
        status: 'ended',
        winnerId,
        finalPrice,
        price: finalPrice ?? state.active.auction?.price ?? 0,
      };
      state.active.version = version;
      state.active.serverNow = serverNow;
    },
    aiPending(state, action) {
      const interaction = action.payload;
      if (!dedupe(state.active.publicAIInteractions, interaction.id)) {
        state.active.publicAIInteractions = [...state.active.publicAIInteractions, interaction];
      }
    },
    aiReceived(state, action) {
      const interaction = action.payload;
      const idx = state.active.publicAIInteractions.findIndex((i) => i.id === interaction.id);
      if (idx >= 0) {
        state.active.publicAIInteractions[idx] = interaction;
      } else {
        state.active.publicAIInteractions = [...state.active.publicAIInteractions, interaction];
      }
    },
    aiFailed(state, action) {
      const interaction = action.payload;
      const idx = state.active.publicAIInteractions.findIndex((i) => i.id === interaction.id);
      if (idx >= 0) {
        state.active.publicAIInteractions[idx] = interaction;
      } else {
        state.active.publicAIInteractions = [...state.active.publicAIInteractions, interaction];
      }
    },
    presenceReceived(state, action) {
      state.active.participants = action.payload;
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
        state.catalog.auctions = action.payload;
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
      .addCase(loadAuctionSnapshot.pending, (state, action) => {
        state.active.loading = true;
        state.active.error = null;
        state.active.auction = null;
        state.active.bids = [];
        state.active.publicAIInteractions = [];
        state.active.participants = [];
        state.active.currentId = String(action.meta.arg);
        state.active.requestId = action.meta.requestId;
      })
      .addCase(loadAuctionSnapshot.fulfilled, (state, action) => {
        if (state.active.requestId !== action.meta.requestId) return;
        const { auction, bids, aiInteractions, serverNow, version } = action.payload;
        state.active.auction = auction ? toAuctionCard(auction) : null;
        state.active.bids = bids || [];
        state.active.publicAIInteractions = aiInteractions || [];
        state.active.participants = [];
        state.active.version = version ?? auction?.version ?? 0;
        state.active.serverNow = serverNow;
        state.active.loading = false;
        state.active.error = null;
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
        state.active.submitStatus = 'success';
        // The socket event will handle the actual state update
      })
      .addCase(submitBid.rejected, (state, action) => {
        state.active.submitStatus = 'error';
        state.active.error = action.payload;
      })
      .addCase(askAI.pending, (state) => {
        // AI pending is handled by socket event
      })
      .addCase(askAI.fulfilled, (state, action) => {
        // The socket event will handle the actual state update
      })
      .addCase(askAI.rejected, (state, action) => {
        // Error handled in component
      })
      .addCase(loadAIInteractions.fulfilled, (state, action) => {
        state.active.publicAIInteractions = action.payload;
      })
      .addCase(loadBids.fulfilled, (state, action) => {
        state.active.bids = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase('auth/logout', (state) => {
        state.catalog.auctions = [];
        state.catalog.error = null;
        state.active = { ...initialState.active, loading: false };
        state.create = { ...initialState.create };
      });
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
  clearCatalogError,
  resetCreateStatus,
} = auctionSlice.actions;

export const selectCatalogAuctions = (state) => state.auction.catalog.auctions;
export const selectCatalogLoading = (state) => state.auction.catalog.loading;
export const selectCatalogError = (state) => state.auction.catalog.error;
export const selectCreateStatus = (state) => state.auction.create.status;
export const selectCreateError = (state) => state.auction.create.error;

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

export default auctionSlice.reducer;
