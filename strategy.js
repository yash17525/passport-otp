'use strict';
const passport = require('passport-strategy');
var speakeasy = require('speakeasy')
var findcountryCodes = require('./countryCodes');
var EmailService = require('./sendEmail');
var TwilioService = require('./twilioService');
const Strategy = function (options, verify) {

    if (typeof options == 'function') {
        verify = options;
        options = {};
    }
    this.callbackURL = options.callbackPath
    passport.Strategy.call(this);
    this.name = 'otp';
    this._verify = verify;
    this._messageProvider = options.messageProvider; // This is custom sms service callback function, if it is not provided then defaut twilioService will be used.
    this._modelName = options.modelToSaveGeneratedKeys;
    this._sendOtpVia = options.sendOtpVia;
    this._messageClient = (this._sendOtpVia === 'phone' ? new TwilioService(options.twilioInfo) : new EmailService(options.emailInfo);
}

Strategy.prototype.authenticate = async function (req, options) {
    const self = this;
    var phone;
    let data = Object.assign(req.query, req.body) || {};
    var phoneInfo = [data.countryCode, data.mobile]

    try {
        self._sendOtpVia == 'phone' ?
            phone = await self.validate(phoneInfo) :
            await self.validate(data.email);

        (!data.token) ?
            self.sendToken.call(self, req, self._sendOtpVia == 'phone' ? phone : email) :
            self.submitToken.call(self, data.token, req, phone, data.email);
    } catch (e) {
        console.error(e.message);
        return req.res.json({
            statusCode: 400,
            message: e.message
        });
    }
}

Strategy.prototype.sendToken = async function (req, emailOrPhone) {
    const res = req.res;
    var secret = speakeasy.generateSecret();
    var token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
    });

    try {
        req.app.models[this._modelName].create({ phone: emailOrPhone, secret: secret.base32 });
        let result = await this._messageClient.sendMessage(emailOrPhone, token);
        console.log('Message Sent. Details ---->\n', result);
        console.log('This is the generated token :', token);
        return res.json({
            statusCode: 202,
            message: "TOKEN_SENT"
        });
    } catch (err) {
        console.log(err);
        return res.json({
            statusCode: 400,
            message: "error occured"
        });

    }
}

Strategy.prototype.validate = async function (emailOrPhone) {
    if (this._sendOtpVia == 'email') {
        var emailValidation = /^[a-zA-Z0-9_+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/;
        if (!emailOrPhone || !emailOrPhone.match(emailValidation)) { throw new Error('Invalid Email'); }
    } else {
        var countryCode = emailOrPhone[0];
        var mobile = emailOrPhone[1];
        if (!countryCode || !findcountryCodes(countryCode)) { throw new Error('Invalid Country Code'); }
        var phoneValidation = /^\d{10}$/;
        if (!mobile || !mobile.match(phoneValidation)) { throw new Error('Invalid mobile number'); }
        return countryCode + mobile;
    }
}

Strategy.prototype.submitToken = async function (token, req, phone, email) {
    const self = this;
    try {
        await self.verifyToken(req, self._sendOtpVia == 'email' ? email : phone, token);
        function verified(err, user, info) {
            if (err) { return self.error(err); }
            if (!user) { return self.fail(info); }
            self.success(user, info);
        }
        return self._verify(req, null, null, {
            phone: phone,
            username: phone,
            emails: !email ? [{ 'value': phone + '@anonymous.com' }] : [{ 'value': email }],
            id: phone,
        }, verified);

    } catch (e) {
        console.error(e.message);
        return req.res.json({
            statusCode: 400,
            message: e.message
        });
    }
}

Strategy.prototype.verifyToken = async function (req, phoneOrEmail, tokenEnteredByUser) {
    var result = await req.app.models[this._modelName].find({ where: { phone: phoneOrEmail }, order: 'id DESC', limit: 1 })
    if (result.length == 0) {
        throw new Error(phoneOrEmail + ' doesn\'t exist in our database...');
    }
    var tokenValidates = speakeasy.totp.verify({
        secret: result[0].secret,
        encoding: 'base32',
        token: tokenEnteredByUser,
        window: 6
    });
    if (!tokenValidates) { throw new Error('Invalid token'); }
}

// Expose constructor.
module.exports = Strategy;