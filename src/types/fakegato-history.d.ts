declare module 'fakegato-history' {
  import { API, Service } from 'homebridge';
  function fakegato(api: API): new (type: string, accessory: any, options: any) => Service;
  export = fakegato;
}
