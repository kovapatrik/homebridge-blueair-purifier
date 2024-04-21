use serde::{Deserialize, Serialize};
use gloo_utils::format::JsValueSerdeExt;
use wasm_bindgen::prelude::*;

use crate::homebridge;

#[derive(Serialize, Deserialize)]
struct Config {
  name: String,
  temperature: f64,
}

#[wasm_bindgen]
pub struct Platform {
  service: homebridge::Service,
  characteristic: homebridge::Characteristic,
  log: homebridge::Logger,
  config: Config,
  api: homebridge::API,
  accessories: Vec<homebridge::PlatformAccessory>,
}

#[wasm_bindgen]
impl Platform {
  #[wasm_bindgen(constructor)]
  pub fn new(log: homebridge::Logger, config: JsValue, api: homebridge::API) -> Self {

    let config: Config = config.into_serde().unwrap();

    let mut platform = Platform {
      service: api.hap().service(),
      characteristic: api.hap().characteristic(),
      log,
      config,
      api,
      accessories: Vec::new(),
    };

    platform.log.info("Platform finished initializing!");
    platform.api.on("didFinishLaunching", &|| {
      platform.log.info("Platform didFinishLaunching");
    });

    platform
  }

  pub fn get_initial_state(&self) -> String {
    "Hello from Rust".to_string()
  }

  pub fn test(&self) -> String {
    "Hello from Rust".to_string()
  }

  #[wasm_bindgen(method, js_name = "configureAccessory")]
  pub fn configure_accessory(&mut self, accessory: homebridge::PlatformAccessory) {
    self.log.info(format!("Loading accessory from cache: {:?}", accessory).as_str());
    self.accessories.push(accessory);
    // this.accessories.push(accessory);
  }
}