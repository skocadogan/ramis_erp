export { runManagedWebSocket } from "./managedWebSocket";
export {
  subscribeSharedWebSocket,
  reconnectAllSharedWebSockets,
  reconnectSharedWebSockets,
  posSyncHubKey,
  kitchenNotificationsHubKey,
  staffNotificationsHubKey,
  waiterCallsHubKey,
} from "./sharedWebSocketHub";
export {
  parseWsMessage,
  acceptWsEvent,
  dedupByEventId,
  shouldApplySequence,
  setOnSequenceGap,
  resetWsEventProtocolState,
  type NormalizedWsMessage,
  type SequenceGapInfo,
} from "./wsEventProtocol";
export {
  getKitchenNotificationsWsUrl,
  getMenuCatalogWsUrl,
  getPosDisplayWsUrl,
  getPosSyncWsUrl,
  getPrepDisplayKitchenNotificationsWsUrl,
  getStaffNotificationsWsUrl,
  getWaiterCallsWsUrl,
  getWarehouseNotificationsWsUrl,
  resolveBranchIdForWs,
} from "./authWsUrl";
