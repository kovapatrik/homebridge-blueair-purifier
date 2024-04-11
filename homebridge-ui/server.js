const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const { defaultConfig, defaultDeviceConfig } = require('../dist/platformUtils.js');
const { BlueAirAwsApi } = require('../dist/api/BlueAirAwsApi.js').default;

var _ = require('lodash');

/*********************************************************************
 * Logger
 * Lightweight log class to mimic the homebridge log capability
 */
class Logger {
  _debug;
  _Reset = '\x1b[0m';
  _Bright = '\x1b[1m';
  _Dim = '\x1b[2m';

  _FgBlack = '\x1b[30m';
  _FgRed = '\x1b[31m';
  _FgGreen = '\x1b[32m';
  _FgYellow = '\x1b[33m';
  _FgBlue = '\x1b[34m';
  _FgMagenta = '\x1b[35m';
  _FgCyan = '\x1b[36m';
  _FgWhite = '\x1b[37m';
  _FgGray = '\x1b[90m';

  constructor(uiDebug = false) {
    this._debug = uiDebug;
  }

  info(str) {
    console.info(this._FgWhite + str + this._Reset);
  }

  warn(str) {
    console.warn(this._FgYellow + str + this._Reset);
  }

  error(str) {
    console.error(this._FgRed + str + this._Reset);
  }

  debug(str) {
    if (this._debug) {
      console.debug(this._FgGray + str + this._Reset);
    }
  }

  setDebugEnabled(enabled = true) {
    this._debug = enabled;
  }
}

/*********************************************************************
 * UIServer
 * Main server-side script called when Custom UI client sends requests
 */
class UiServer extends HomebridgePluginUiServer {

  logger;
  config;
  api;

  constructor() {
    super();
    // Obtain the plugin configuration from homebridge config JSON file.
    const config = require(this.homebridgeConfigPath).platforms.find((obj) => obj.platform === 'blueair-purifier');
    this.logger = new Logger(config?.uiDebug ? config.uiDebug : false);
    this.logger.info('Custom UI created.');
    this.logger.debug(`ENV:\n${JSON.stringify(process.env, null, 2)}`);

    this.onRequest('/mergeToDefault', async ({ config }) => {
      _.defaultsDeep(config, defaultConfig);
      config.devices.forEach((device) => {
        _.defaultsDeep(device, defaultDeviceConfig);
      });
      this.config = config;
      this.logger.setDebugEnabled(config.uiDebug ? config.uiDebug : false);
      this.logger.debug(`Merged config:\n${JSON.stringify(config, null, 2)}`);
      return config;
    });

    this.onRequest('/getDefaults', async () => {
      return {
        defaultConfig,
        defaultDeviceConfig,
      };
    });

    this.onRequest('/discover', async ({ username, password, region }) => {
      try {
        this.api = new BlueAirAwsApi(username, password, region, this.logger);
        await this.api.login();
        const devices = await this.api.getDevices();

        return devices;
      } catch (e) {
        const msg = e instanceof Error ? e.stack : e;
        throw new RequestError(`Device discovery failed:\n${msg}`);
      }
    });

    this.onRequest('/getInitialDeviceStates', async ({ accountUuid, uuids }) => {
      try {
        return await this.api.getDeviceStatus(accountUuid, uuids);
      } catch (e) {
        const msg = e instanceof Error ? e.stack : e;
        throw new RequestError(`Failed to get initial device states:\n${msg}`);
      }
    });

    // inform client-side script that we are ready to receive requests.
    this.ready();
  }
}

// start the instance of the class
(() => {
  return new UiServer();
})();
