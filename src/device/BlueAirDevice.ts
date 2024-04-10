import EventEmitter from 'events';
import { BlueAirAwsApi } from '../api/BlueAirAwsApi';

export class BlueAirDevice extends EventEmitter {

  protected readonly api: BlueAirAwsApi;
}