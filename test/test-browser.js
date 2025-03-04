/* eslint-disable no-undef */
chai.use(require("chai-as-promised"));
window.axios = StellarSdk.httpClient;
window.HorizonAxiosClient = StellarSdk.HorizonAxiosClient;
