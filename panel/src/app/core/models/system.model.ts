/** Mirrors `MqttState` in `backend/src/mqtt/mod.rs`. */
export interface MqttStatus {
  connected:          boolean;
  last_message_at_ms: number | null;
}
