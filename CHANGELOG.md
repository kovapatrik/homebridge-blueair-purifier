# Changelog

## [1.3.0](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.2.2...v1.3.0) (2026-11-14)


### Features

* add cloud region option for discovery ([#53](https://github.com/kovapatrik/homebridge-blueair-purifier/issues/53)) ([fdda073](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/fdda0735340213e08f565feeb02a09177da96359))
* support for 2-in-1 ([#54](https://github.com/kovapatrik/homebridge-blueair-purifier/issues/54)) ([47f2bf1](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/47f2bf17a3ec1161affecdbc9116814c40fbc4dc))


### Bug Fixes

* keep credentials and tokens out of Blueair logs ([#49](https://github.com/kovapatrik/homebridge-blueair-purifier/issues/49)) ([ea6cc18](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/ea6cc1804bdd7ee59570ef2a4b9098011a0e0dff))
* recover gracefully from BlueAir rate-limit responses (229/429) ([#43](https://github.com/kovapatrik/homebridge-blueair-purifier/issues/43)) ([d9c5175](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/d9c51750d5a8c0e4e92b3dd2c8a3b189b3a8f64f))
* update runtime lodash to 4.18.1 ([#50](https://github.com/kovapatrik/homebridge-blueair-purifier/issues/50)) ([3d120c1](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/3d120c1f15c460cf396340af6e4491406208f727))

## [1.2.2](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.2.1...v1.2.2) (2026-10-02)


### Bug Fixes

* clamp filter life to HomeKit range ([f43fe46](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/f43fe466de756bfdaf85e8a7b3c827d235bd1dff))
* fix Blue Signature manual mode selection ([dc9e1af](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/dc9e1af77bad1989bb05bf8fc9be1992819be4b0))

## [1.2.1](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.2.0...v1.2.1) (2026-08-27)


### Bug Fixes

* custom ui delete empty objects wont leave empty space ([63c0e28](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/63c0e28098eae154191fb6717163a0fab8e541b7))

## [1.2.0](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.1.1...v1.2.0) (2026-08-17)


### Features

* map sku to device type, handle signature device automode ([0c81d79](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/0c81d79829ee04db19435bb3446dfab446bd60c2))


### Bug Fixes

* added debug logs for AWS api calls ([6e6da19](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/6e6da19c0d1c5eb4ec2ca57d381f6c497b0e93d9))
* address PR review feedback for Blue 40/SP4i sensor fallback ([10ea760](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/10ea760c09d7afb7ea68dd3db27959725a60f6fe))
* correct pm2_5 case label and add pm1 update path ([e1cfba6](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/e1cfba67721bef963d2f0a5acab633d5bb23cf10))
* fetch sensor data from telemetry endpoint for Blue 40/SP4i devices ([252d7f1](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/252d7f1fd77f33d62fe8e7f397251051de81db42))
* improve telemetry types and sensor discovery ([0266a03](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/0266a03963d7a35f3171470439968c6abf96b263))
* sensor data fallback and PM2.5 polling for Blue 40/SP4i ([81e62a5](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/81e62a55006cc089302be31234d972b43b7058e8))
* signature auto mode ([9c95eed](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/9c95eed82475452e56fdb3324a8133edd1a379aa))
* use PAT for release-please to trigger publish workflow [skip ci] ([623bcd2](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/623bcd22e9ce86650debc33c82fc5f33a7b04147))
* use workflow_call instead [skip ci] ([817f8b0](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/817f8b0d570d4068b7fdbe59a28c18454edebb21))

## [1.1.1](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.1.0...v1.1.1) (2026-06-30)


### Bug Fixes

* support split Blueair cloud regions ([493d6dd](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/493d6dd77191b4a72bcdd99672941125ae382ed0))
* support split Blueair cloud regions ([84475d0](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/84475d0455ef004661a2660a766c1b2383bed10b))

## v1.1.0
## 2026-01-07
- fix: correct handling of state/sensor updates, so the states of the accessory in the Home app refreshes correctly
- fix: correct mutex usage
- fix: supports Node.js v24 (fixes #26)
- chore: outdated dependencies

## v1.0.11
## 2024-07-21
- fix: added Canada to the custom UI
