# Changelog

# v1.1.0
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

## 2026-01-07
- fix: correct handling of state/sensor updates, so the states of the accessory in the Home app refreshes correctly
- fix: correct mutex usage
- fix: supports Node.js v24 (fixes #26)
- chore: outdated dependencies

# v1.0.11
## 2024-07-21
- fix: added Canada to the custom UI
