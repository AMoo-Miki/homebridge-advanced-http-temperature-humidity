var Service, Characteristic;
var request = require('request');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-advancedhttptemperaturehumidity", "AdvancedHttpTemperatureHumidity", AdvancedHttpTemperatureHumidity);
};

function AdvancedHttpTemperatureHumidity(log, config) {
    this.log = log;
    this.humidityService = false;

    // Config
    this.url = config["url"];
    this.http_method = config["http_method"] || "GET";
    this.sendimmediately = config["sendimmediately"] || false;
    this.username = config["username"] || "";
    this.password = config["password"] || "";

    this.name = config["room"] || config["name"];

    this.manufacturer = config["manufacturer"] || "HttpTemperatureHumidity";
    this.model = config["model"] || "HTTP";
    this.serial = config["serial"] || "18981898";

    this.disableHumidity = config["disableHumidity"] || false;

    if (config.modifiers) {
        if (typeof config.modifiers.temperature === 'string') this.temperatureModifier = new Function('x', 'return ' + config.modifiers.temperature);
        if (typeof config.modifiers.humidity === 'string') this.humidityModifier = new Function('x', 'return ' + config.modifiers.humidity);
    }
}

AdvancedHttpTemperatureHumidity.prototype = {

    httpRequest: function (url, body, method, username, password, sendimmediately, callback) {
        request({
                url: url,
                body: body,
                method: method,
                rejectUnauthorized: false,
                auth: {
                    user: username,
                    pass: password,
                    sendImmediately: sendimmediately
                }
            },
            function (error, response, body) {
                callback(error, response, body)
            })
    },

    getStateHumidity: function (callback) {
        var self = this;
        setTimeout(function() {
            if (self._updating) return self.getStateHumidity(callback);
            if (self._hasErrors) return callback(self._hasErrors);
            callback(null, self.humidity);
        }, 1000);
    },

    getState: function (callback) {
        this._updating = true;
        this._hasErrors = null;
        this.httpRequest(this.url, "", (this.http_method || "GET"), this.username, this.password, this.sendimmediately, function (error, response, responseBody) {
            if (error) {
                this._updating = false;
                this._hasErrors = 'Get Temperature failed: ' + error.message;
                this.log(this._hasErrors);
                return callback(error);
            }

            if (response && response.statusCode !== 200) {
                this._updating = false;
                this._hasErrors = 'Get Temperature failed: ' + response.statusCode;
                this.log(this._hasErrors);
                return callback(this._hasErrors);
            }

            var info;
            try {
                info = JSON.parse(responseBody);
            } catch(ex) {
                this._updating = false;
                this._hasErrors = 'Get Temperature failed to parse: ' + responseBody;
                this.log(this._hasErrors);
                return callback(this._hasErrors);
            }

            if (info.status !== 1) {
                this._updating = false;
                this._hasErrors = 'Get Temperature failed to get valid values with status: ' + info.status;
                this.log(this._hasErrors);
                return callback(this._hasErrors);
            }

            this.log('Get Temperature succeeded!');

            var temperature = parseFloat(info.temperature);
            if (!isFinite(temperature)) {
                this._updating = false;
                this._hasErrors = 'Get Temperature failed with invalid temperature: ' + info.temperature;
                this.log(this._hasErrors);
                return callback(this._hasErrors);
            }

            if (this.temperatureModifier) temperature = this.temperatureModifier(temperature);

            if (this.humidityService !== false) {
                var humidity = parseFloat(info.humidity);
                if (!isFinite(humidity)) {
                    this._hasErrors = 'Get Temperature failed with invalid humidity: ' + info.humidity;
                    this.log(this._hasErrors);
                } else {
                    if (this.humidityModifier) humidity = this.humidityModifier(humidity);

                    this.humidityService.setCharacteristic(Characteristic.CurrentRelativeHumidity, humidity);
                    this.humidity = humidity;
                }
            }

            this._updating = false;

            callback(null, temperature);

        }.bind(this));
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        var services = [],
            informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
        services.push(informationService);

        temperatureService = new Service.TemperatureSensor(this.name + " Temperature");
        temperatureService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({minValue: -273, maxValue: 200})
            .on('get', this.getState.bind(this));
        services.push(temperatureService);

        if (this.disableHumidity !== true) {
            this.humidityService = new Service.HumiditySensor(this.name + " Humidity");
            this.humidityService
                .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                .setProps({minValue: 0, maxValue: 100})
                .on('get', this.getStateHumidity.bind(this));
            services.push(this.humidityService);
        }

        return services;
    }
};