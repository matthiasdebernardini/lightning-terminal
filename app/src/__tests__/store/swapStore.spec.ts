import { values } from 'mobx';
import * as LOOP from 'types/generated/loop_pb';
import { grpc } from '@improbable-eng/grpc-web';
import { waitFor } from '@testing-library/react';
import { loopListSwaps } from 'util/tests/sampleData';
import { createStore, Store, SwapStore } from 'store';

const grpcMock = grpc as jest.Mocked<typeof grpc>;

describe('SwapStore', () => {
  let rootStore: Store;
  let store: SwapStore;

  beforeEach(async () => {
    rootStore = createStore();
    store = rootStore.swapStore;
  });

  it('should fetch list of swaps', async () => {
    expect(store.sortedSwaps).toHaveLength(0);
    await store.fetchSwaps();
    expect(store.sortedSwaps).toHaveLength(7);
  });

  it('should handle errors fetching channels', async () => {
    grpcMock.unary.mockImplementationOnce(desc => {
      if (desc.methodName === 'ListSwaps') throw new Error('test-err');
      return undefined as any;
    });
    expect(rootStore.uiStore.alerts.size).toBe(0);
    await store.fetchSwaps();
    await waitFor(() => {
      expect(rootStore.uiStore.alerts.size).toBe(1);
      expect(values(rootStore.uiStore.alerts)[0].message).toBe('test-err');
    });
  });

  it('should update existing swaps with the same id', async () => {
    expect(store.swaps.size).toEqual(0);
    await store.fetchSwaps();
    expect(store.swaps.size).toEqual(loopListSwaps.swapsList.length);
    const prevSwap = store.sortedSwaps[0];
    const prevAmount = prevSwap.amount;
    prevSwap.amount = 123;
    await store.fetchSwaps();
    const updatedSwap = store.sortedSwaps[0];
    // the existing swap should be updated
    expect(prevSwap).toBe(updatedSwap);
    expect(updatedSwap.amount).toBe(prevAmount);
  });

  it.each<[number, string]>([
    [LOOP.SwapState.INITIATED, 'Initiated'],
    [LOOP.SwapState.PREIMAGE_REVEALED, 'Preimage Revealed'],
    [LOOP.SwapState.HTLC_PUBLISHED, 'HTLC Published'],
    [LOOP.SwapState.SUCCESS, 'Success'],
    [LOOP.SwapState.FAILED, 'Failed'],
    [LOOP.SwapState.INVOICE_SETTLED, 'Invoice Settled'],
    [-1, 'Unknown'],
  ])('should display the correct label for swap state %s', async (state, label) => {
    await store.fetchSwaps();
    const swap = store.sortedSwaps[0];
    swap.state = state;
    expect(swap.stateLabel).toEqual(label);
  });

  it.each<[number, string]>([
    [LOOP.SwapType.LOOP_IN, 'Loop In'],
    [LOOP.SwapType.LOOP_OUT, 'Loop Out'],
    [-1, 'Unknown'],
  ])('should display the correct name for swap type %s', async (type, label) => {
    await store.fetchSwaps();
    const swap = store.sortedSwaps[0];
    swap.type = type;
    expect(swap.typeName).toEqual(label);
  });

  it('should poll for swap updates', async () => {
    await store.fetchSwaps();
    const swap = store.sortedSwaps[0];
    // create a pending swap to trigger auto-polling
    swap.state = LOOP.SwapState.INITIATED;
    expect(store.pendingSwaps).toHaveLength(1);
    // wait for polling to start
    await waitFor(() => {
      expect(store.pollingInterval).toBeDefined();
    });
    // change the swap to complete
    swap.state = LOOP.SwapState.SUCCESS;
    expect(store.pendingSwaps).toHaveLength(0);
    // confirm polling has stopped
    await waitFor(() => {
      expect(store.pollingInterval).toBeUndefined();
    });
  });

  it('should handle startPolling when polling is already running', () => {
    expect(store.pollingInterval).toBeUndefined();
    store.startPolling();
    expect(store.pollingInterval).toBeDefined();
    store.startPolling();
    expect(store.pollingInterval).toBeDefined();
  });

  it('should handle stopPolling when polling is already stopped', () => {
    expect(store.pollingInterval).toBeUndefined();
    store.stopPolling();
    expect(store.pollingInterval).toBeUndefined();
  });
});
