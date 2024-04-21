use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "homebridge")]
extern "C" {
    
    #[derive(Clone, Debug)]
    pub type API;
    #[wasm_bindgen(method, getter, structural)]
    pub fn hap(this: &API) -> HAP;
    #[wasm_bindgen(method, structural)]
    pub fn on(this: &API, event: &str, callback: &dyn Fn());

    #[derive(Clone, Debug)]
    pub type Logger;
    #[wasm_bindgen(method, structural)]
    pub fn info(this: &Logger, message: &str);
    #[wasm_bindgen(method, structural)]
    pub fn warn(this: &Logger, message: &str);
    #[wasm_bindgen(method, structural)]
    pub fn error(this: &Logger, message: &str);

    #[derive(Clone, Debug)]
    pub type PlatformAccessory;
    #[wasm_bindgen(method, getter, structural, js_name = "displayName")]
    pub fn display_name(this: &PlatformAccessory) -> String;
    #[wasm_bindgen(method, getter, structural, js_name = "UUID")]
    pub fn uuid(this: &PlatformAccessory) -> String;
    #[wasm_bindgen(method, getter, structural)]
    pub fn services(this: &PlatformAccessory) -> js_sys::Array;
    #[wasm_bindgen(method, getter, structural)]
    pub fn context(this: &PlatformAccessory) -> js_sys::Object;

    #[derive(Clone, Debug)]
    pub type PlatformConfig;

    #[derive(Clone, Debug)]
    pub type Service;

    #[derive(Clone, Debug)]
    pub type Characteristic;

    #[derive(Clone, Debug)]
    pub type HAP;
    #[wasm_bindgen(method, getter, structural, js_name = "Service")]
    pub fn service(this: &HAP) -> Service;
    #[wasm_bindgen(method, getter, structural, js_name = "Characteristic")]
    pub fn characteristic(this: &HAP) -> Characteristic;
}