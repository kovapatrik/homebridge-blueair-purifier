# Blue 40/SP4i Plugin Enhancements Design

## Context

The homebridge-blueair-purifier plugin (forked to seanpmgallagher/homebridge-blueair-purifier) has been patched to fetch sensor data from the Blueair historical telemetry endpoint for Blue 40/SP4i devices, which return empty `sensordata[]` from the `/initial` REST endpoint. PM2.5, PM10, and PM1 readings now flow into HomeKit via the `AirQualitySensor` service.

This spec covers three independent PRs that build on that foundation.

## PR 1: Bug Fixes (upstream-ready)

**Branch:** `fix/blue40-sensor-telemetry` (existing — add commits)

### Problem

Two typo bugs prevent PM2.5 updates from propagating during polling:

1. **`AirPurifierAccessory.ts` line 164:** `case 'pm25':` should be `case 'pm2_5':`. The `BlueAirDeviceSensorDataMap` maps API field `pm2_5` to key `pm2_5`, but the switch statement checks for `pm25`. Result: PM2.5 characteristic updates from polling never reach HomeKit — only the initial value loads.

2. **`BlueAirDevice.ts` line 173** (already fixed on this branch): Same pattern — `k === 'pm25'` should be `k === 'pm2_5'` for AQI recalculation.

### Additional fix: missing pm1 update path

The plugin receives `pm1` from the telemetry endpoint but has no `case 'pm1':` in `updateCharacteristics`. While HomeKit has no native PM1 characteristic, the value feeds into the AQI calculation. A `pm1` case should trigger `updateAirQuality = true` so AQI recalculates when PM1 changes.

### Changes

| File | Change |
|------|--------|
| `src/accessory/AirPurifierAccessory.ts` | `case 'pm25':` → `case 'pm2_5':` (line 164) |
| `src/accessory/AirPurifierAccessory.ts` | Add `case 'pm1': updateAirQuality = true; break;` |
| `src/device/BlueAirDevice.ts` | Already fixed: `pm25` → `pm2_5` (line 173) |
| `src/api/BlueAirAwsApi.ts` | Already committed: telemetry fallback for empty sensordata |
| `src/api/Consts.ts` | Already committed: telemetry response type, ds field on device config |

### Testing

- Deploy to media-server, restart Blueair child bridge
- Confirm PM2.5 updates in HomeKit after multiple polling cycles (not just initial load)
- Confirm AirQuality enum updates when PM values change
- Remove temporary info-level telemetry log lines before submitting upstream

---

## PR 2: fakegato-history (Eve Graphs)

**Branch:** `feat/fakegato-history` off `main`

### Goal

Add historical graphing of PM2.5 data in the Eve app. Users see line charts of air quality over hours, days, and weeks per device — useful for tracking trends, validating purifier effectiveness, and comparing rooms.

### Approach

Use the `fakegato-history` npm package (widely used in Homebridge ecosystem, powers Eve app graphs). The "room" history type supports air quality PPM alongside optional temperature and humidity.

### Architecture

```
AirPurifierAccessory
  |
  +-- FakeGatoHistoryService (type: "room")
        - Receives addEntry({ time, ppm }) on each polling update
        - Persists to JSON files in Homebridge storage directory
        - Eve app reads via HAP history characteristic
```

### Changes

| File | Change |
|------|--------|
| `package.json` | Add `fakegato-history` dependency |
| `src/platformUtils.ts` | Add `history: boolean` to `DeviceConfig` (default: `false`) |
| `src/accessory/AirPurifierAccessory.ts` | Import fakegato-history, create history service when config enabled, log PM2.5 on each `stateUpdated` event |
| `config.schema.json` | Add `history` checkbox to device config UI |

### Config

```json
{
  "devices": [{
    "id": "...",
    "name": "Living Room Purifier",
    "history": true
  }]
}
```

### Key implementation details

- **History type:** `"room"` — supports a `ppm` field. PM2.5 is reported in ug/m3; fakegato-history accepts the raw numeric value in the `ppm` field and Eve displays it as-is. This is the standard convention in the Homebridge ecosystem (e.g., homebridge-xiaomi-air-purifier, homebridge-bme680).
- **Logging frequency:** Every polling cycle (default 15 seconds). fakegato-history internally aggregates to ~10-minute intervals for storage, so this is not excessive.
- **Storage:** fakegato-history writes to `~/.homebridge/persist/` automatically. No configuration needed.
- **Opt-in:** Disabled by default. The `history` config toggle keeps this from adding overhead for users who don't use Eve.
- **Accessory info:** Pass the accessory and platform API references to FakeGatoHistoryService so it attaches correctly to the HAP accessory tree.

### Dependencies

- `fakegato-history` — MIT licensed, actively maintained, standard in the Homebridge ecosystem
- No other new dependencies

### Testing

- Enable `history: true` on one device
- Install Eve app on iPhone
- Verify PM2.5 graph appears in Eve for the accessory
- Verify data points accumulate over time (check after 30+ minutes)
- Verify no impact when `history: false` (default)

---

## PR 3: Countdown to Clean Air (aireta)

**Branch:** `feat/aireta-countdown` off `main`

### Goal

Expose the Blue 40's "Countdown to Clean Air" value — an estimated number of minutes until the air reaches clean quality, calculated by the device based on current PM levels, room configuration, and fan speed. Visible in Eve and Controller for HomeKit as a custom characteristic.

### Approach

The `aireta` value is already returned in the device's `states` array from the `/initial` endpoint (confirmed in API response: `{"n":"aireta","v":0,"t":1779591642}`). It just needs to be plumbed through the state model and exposed via a custom HomeKit characteristic.

HomeKit has no standard "time remaining" characteristic for air purifiers. We'll use a custom characteristic with a unique UUID, registered as an optional characteristic on the AirQualitySensor service. Eve and Controller for HomeKit display custom characteristics with their name and value; Apple Home silently ignores them.

### Architecture

```
BlueAirAwsApi (states array)
  → BlueAirDevice.state.aireta (number, minutes)
    → AirPurifierAccessory custom characteristic
      → Visible in Eve as "Countdown to Clean Air: X min"
```

### Changes

| File | Change |
|------|--------|
| `src/api/BlueAirAwsApi.ts` | `aireta` is already captured by the generic state parser (it reads all `states` entries). No change needed. |
| `src/device/BlueAirDevice.ts` | Add `aireta` to `BlueAirDeviceState` type definition for type safety |
| `src/accessory/AirPurifierAccessory.ts` | Define custom characteristic class `CountdownToCleanAir` with unique UUID. Create and attach to AirQualitySensor service when config enabled. Add `case 'aireta':` to update handler. |
| `src/platformUtils.ts` | Add `countdownToCleanAir: boolean` to `DeviceConfig` (default: `false`) |
| `config.schema.json` | Add `countdownToCleanAir` checkbox to device config UI |

### Custom characteristic definition

```typescript
class CountdownToCleanAir extends Characteristic {
  static readonly UUID = 'E863F12E-079E-48FF-8F27-9C2605A29F52';
  constructor() {
    super('Countdown to Clean Air', CountdownToCleanAir.UUID, {
      format: Formats.UINT16,
      perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      unit: 'minutes',
      minValue: 0,
      maxValue: 1440,
    });
  }
}
```

Note: The UUID above is a placeholder. The actual UUID should be generated as a unique v4 UUID to avoid collision with any existing Eve characteristics. The E863F1xx range is used by Eve's own characteristics — we should use a different range.

### Config

```json
{
  "devices": [{
    "id": "...",
    "name": "Living Room Purifier",
    "countdownToCleanAir": true
  }]
}
```

### Key implementation details

- **Value semantics:** `aireta` is 0 when air is already clean, and counts down from some positive number when purifying. The device calculates this based on PM levels, room type setting, and current fan speed.
- **Update frequency:** Updates every polling cycle (15 seconds default) via the normal state polling path.
- **Opt-in:** Disabled by default since it's a custom characteristic only visible in third-party apps.
- **No temperature/humidity:** The SP4i has no temperature or humidity sensors. The `aireta` value is the only additional data point worth exposing.

### Testing

- Enable `countdownToCleanAir: true` on one device
- Restart bridge, open Eve app
- Verify custom characteristic appears on the AirQualitySensor service
- Generate some PM (e.g., cooking) and verify the countdown value increases from 0
- Verify it counts down as air cleans

---

## Branch Strategy

All three PRs branch off `main` independently:

```
main
 ├── fix/blue40-sensor-telemetry  (PR 1: bug fixes + telemetry)
 ├── feat/fakegato-history        (PR 2: Eve graphs)
 └── feat/aireta-countdown        (PR 3: countdown to clean air)
```

PR 1 is submitted upstream to kovapatrik/homebridge-blueair-purifier. PRs 2 and 3 can be submitted upstream after PR 1 is merged, or kept on the fork.

For local deployment on media-server, all three branches can be merged into a local `deploy` branch that combines everything.

## Out of Scope

- ContactSensor notification hack (user decided Home app status is sufficient)
- LED brightness enhancement (already implemented as Lightbulb with Brightness)
- Night mode as scene target (already implemented as Switch service)
- MQTT real-time sensor subscription (significant complexity, telemetry REST is sufficient)
- Temperature/humidity sensors (SP4i hardware does not have these)
- Ionizer control (cannot be toggled on any current Blueair model)
- Blueair scheduling/timer system (use HomeKit automations instead)
