<p align="center">
  <a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="Homebridge Verified" src="./branding/Homebridge_x_Blueair.svg" width="500px"></a>
</p>

# homebridge-blueair-purifier

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/v/homebridge-blueair-purifier)](https://www.npmjs.com/package/homebridge-blueair-purifier)
[![npm](https://badgen.net/npm/dt/homebridge-blueair-purifier?label=downloads)](https://www.npmjs.com/package/homebridge-blueair-purifier)

## Installation

**Option 1: Install via Homebridge Config UI X:**

Search for "Blueair Purifier" in in [homebridge-config-ui-x](https://github.com/oznu/homebridge-config-ui-x) and install `homebridge-blueair-purifier`.

**Option 2: Manually Install:**

```text
sudo npm install -g homebridge-blueair-purifier
```

## Supported Devices

This plugin only supports WiFi connected BlueAir purifiers utilizing cloud connectivity (via AWS) for device communication. Below is a list of known tested products.

| Device | Product Page |
|----------------|------------|
| Blue Pure 211i Max | [link](https://www.blueair.com/us/air-purifiers/blue-pure-211i-max/3541.html?cgid=air-purifiers) |
| Blue Pure 311i+ Max | [link](https://www.blueair.com/us/air-purifiers/blue-pure-311i-plus-max/3540.html?cgid=air-purifiers) |
| Blue Pure 311i Max | [link](https://www.blueair.com/us/air-purifiers/blue-pure-311i-max/3539.html?cgid=air-purifiers) |
| Blue Pure 411i Max | [link](https://www.blueair.com/us/air-purifiers/blue-pure-411i-max/3538.html?cgid=air-purifiers) |
| Blue Pure 511i Max | [link](https://www.blueair.com/us/air-purifiers/blue-pure-511i-max/3710.html) |
| Protect 7470i | [link](https://www.blueair.com/us/air-purifiers/2954.html?cgid=air-purifiers) |
| DustMagnet™ 5440i | [link](https://www.blueair.com/us/air-purifiers/dustmagnet-5440i/2420.html?cgid=air-purifiers) |

### Features

- **Simple Login Mechanism** - all you need is your username and password to get started.
- **Semi-automatic detection and configuration of multiple BlueAir devices.**
- **Fast response times** - the plugin uses the BlueAir API to communicate with the devices.

>[!NOTE]
>**Air quality readings** - the plugin may not always report the correct air quality readings (like PM 2.5) due to the BlueAir API limitations. The solution for this issue is in progress.

## Plugin Configuration

### Feature Toggles
* Show LED service as a lightbulb
* Show Air Quality Sensor service
* Show Temperature Sensor service
* Show Germ Shield switch service
* Show Night Mode switch service

### Customizable Options
* Adjustable Filter Change Level
* Device Name
* Verbose Logging
* BlueAir Server Region Selection

### Polling behavior

`pollingInterval` defaults to `15000` milliseconds. Leave it unchanged for periodic updates, especially if you use sensor-threshold automations. Positive intervals keep the existing cached reads, awaited control writes and recurring polling; they do not enable slider buffering or per-write verification.

**Optional on-demand mode:** set `pollingInterval` to `0`. This disables the recurring status timer, while keeping the initial startup fetch. Add these fields to your existing platform configuration and restart the child bridge:

```json
"pollingInterval": 0,
"sliderBufferMs": 2000
```

#### Controls in on-demand mode

Each control operation refreshes the target device before making decisions from its state. Each actual write is then checked against cloud-reported state: one immediate read-back, with up to two further reads one second apart if needed. Verification does not resend the write. Operations share a platform lock so another command or background refresh cannot interrupt this sequence.

Fan-speed slider changes use a rolling buffer, also called a trailing debounce:

1. HomeKit's write handler immediately acknowledges that a speed was **queued**. It does not wait for the buffer or cloud request.
2. Each new speed replaces the pending value and restarts the timer. Intermediate values make no control-related cloud calls.
3. After `sliderBufferMs` of quiet, the final value runs through **read → decide → write → verify**. A value already reported by the device can skip the write.

For example, `66% → 41% → 33%`, with less than two seconds between adjustments, results in one operation for `33%` using the default buffer. For an awake device already in Manual, with immediate cloud confirmation, that is one initial status read, one speed write and one verification read. It is not one cloud request in total: waking or changing mode needs additional writes and verification, and some models' status reads include telemetry fallback calls.

`sliderBufferMs` defaults to `2000` (two seconds), accepts integers from `0` to `30000`, and only applies in on-demand mode. `0` removes the intentional delay. A longer buffer combines more adjustments but increases the delay before the fan responds. Changes spaced farther apart than the window still produce separate operations. If a command has already started, it finishes; later changes collapse into one subsequent batch with a new quiet window after completion.

HomeKit shows a queued speed optimistically until execution settles. Failure clears queued intent, logs a warning and restores the last cloud-reported speed; it does not imply that an already-accepted HomeKit write was applied. Power-off and shutdown cancel unsent buffered values. A command already running may finish; power-off is ordered after it. Other controls remain awaited, and an initial refresh failure prevents their write. During a rate-limit cooldown, on-demand awaited controls report busy; queued slider failures are reconciled asynchronously. Controls are not automatically replayed after failure.

In this mode, standby retains the configured fan speed in HomeKit (the Active characteristic represents power). The initial snapshot is published without invoking setters. For Blue Signature, waking also reapplies the prior preset because the cloud can still report Manual while the device wakes into a different behavior. These interaction changes are confined to the opt-in path; the model-specific Manual/Auto mapping is unchanged here.

#### Reads and freshness in on-demand mode

HomeKit reads return cached values promptly. When the last successful device refresh is at least 15 seconds old, they start one shared background refresh for that device. Concurrent characteristic reads share that work instead of each issuing a request. Startup and successful command reads also mark the cache fresh. A failed refresh retains the old values without marking them fresh.

This is not a screen-open notification: HomeKit can request data in the background, or show its own cache without asking the plugin. A HomeKit read can independently trigger a refresh during slider interaction. There is no recurring polling timer in this mode, but there can still be demand-driven reads and a startup-recovery timer.

**Tradeoff:** changes made through the Blueair app, physical controls and changing air-quality readings are not continuously discovered. A poll before a command refreshes state for that command; it cannot trigger a sensor automation while nothing is reading or controlling the device. Use a positive interval when those continuous updates matter. Cloud verification also cannot prove physical fan behavior and may fail if reported state lags too long.

#### Rate-limit protection in both modes

Blueair rate-limit responses (`229` or `429`) stop the ordinary immediate retry loop. All requests through the same API instance are blocked locally during a cooldown: 30 seconds initially, doubling on repeated throttling up to five minutes. A longer `Retry-After` value takes precedence; both seconds and HTTP dates are supported. Successful API calls reset the exponential delay. A warning records the response status, the header (or its absence) and the selected delay.

Startup retries after cooldown without repeating a successful login. Routine request, queue and state logs use the existing debug logging. This shared backoff is the intentional change affecting positive polling intervals too: normal successful polling behavior is retained, but throttled calls no longer immediately retry.

Removing idle polls, combining slider intent and sharing reads reduces avoidable traffic. It does **not** guarantee that Blueair will never throttle: separate interactions still make requests, verification adds reads, and the Blueair app or another plugin instance may share the account's unknown quota. Cooldown is in memory, per API instance; it is not coordinated across processes or preserved across restarts. Restore a positive interval such as `15000` and restart to return to periodic mode.

### Supported Devices / Features
| Device                                                   | Air Purifier | LED Status Switch |    PM 2.5    | Temp. Sensor | Humidity Sensor | Night Mode | Germ Shield |
|----------------------------------------------------------|:------------:|:-----------------:|:------------:|:------------:|:---------------:|:----------:|:-----------:|
| DustMagnet                                               |      Y       |         Y         |      Y       |      N       |        N        |     Y      |      N      |
| HealthProtect                                            |      Y       |         Y         |      Y       |      Y       |        N        |     Y      |      Y      |
| Blue Pure                                                |      Y       |         Y         |      Y       |      N       |        N        |     Y      |      N      |

## Contribution

Help is always welcome. If you'd like to get involved, check out the [contribution notes](CONTRIBUTING.md).

## Credits
Inspired by the work of [@fsj21](https://github.com/fjs21) on the Amazon Web Services (AWS) API and construction of the documentation. Used part of the [blueair_api](https://github.com/dahlb/blueair_api) implementation as reference to mine. 

### Trademarks

Apple and HomeKit are registered trademarks of Apple Inc.
BlueAir is a trademark of Unilever Corporation
