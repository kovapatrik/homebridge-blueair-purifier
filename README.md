<p align="center">

<img src="./branding/Homebridge_x_Blueair.svg" width="500px">

</p>

<span align="center">

# Homebridge Blueair Purifier

</span>

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
| Protect 7470i | [link](https://www.blueair.com/us/air-purifiers/2954.html?cgid=air-purifiers) |
| DustMagnet™ 5440i | [link](https://www.blueair.com/us/air-purifiers/dustmagnet-5440i/2420.html?cgid=air-purifiers) |

### Features

- **Simple Login Mechanism** - all you need is your username and password to get started.
- **Semi-automatic detection and configuration of multiple BlueAir devices.**
- **Fast response times** - the plugin uses the BlueAir API to communicate with the devices.

## Known Issues

- **Air quality readings** - the plugin may not always report the correct air quality readings (like PM 2.5) due to the BlueAir API limitations. The solution for this issue is in progress.

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

### Supported Devices / Features
| Device                                                   | Air Purifier | LED Status Switch |    PM 2.5    | Temp. Sensor | Humidity Sensor | Night Mode | Germ Shield |
|----------------------------------------------------------|:------------:|:-----------------:|:------------:|:------------:|:---------------:|:----------:|:-----------:|
| DustMagnet                                               |      Y       |         Y         |      Y       |      N       |        N        |     Y      |      N      |
| HealthProtect                                            |      Y       |         Y         |      Y       |      Y       |        N        |     Y      |      Y      |
| Blue Pure                                                |      Y       |         Y         |      Y       |      N       |        N        |     Y      |      N      |

## Credits
Inspired by the work of [@fsj21](https://github.com/fjs21) on the Amazon Web Services (AWS) API and construction of the documentation.

### Trademarks

Apple and HomeKit are registered trademarks of Apple Inc.
BlueAir is a trademark of Unilever Corporation
