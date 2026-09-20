'use strict';
const { contextBridge } = require('electron');
const fixture = require('./standalone-library-ui')();
contextBridge.exposeInMainWorld('nrApp', fixture.api);
contextBridge.exposeInMainWorld('nrTest', fixture.control);
