export type BlueAirDevice = {
  uuid: string;
  name: string;
  userid: string;
  mac: string;
};

export interface BlueAirBase {
  login(): Promise<boolean>;
  getDevices(): Promise<BlueAirDevice[]>;
  getDeviceStatus(uuid: string): Promise<unknown>;
  setDeviceStatus(uuid: string, status: Record<string, unknown>): Promise<boolean>;
}