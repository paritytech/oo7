# oo7-substrate
Polkadot Bonds library


## Console logging
The library utilizes the npm [debug](https://www.npmjs.com/package/debug) module to minimize debug logs to the console. To control what debug output you want to see you can configure the `DEBUG` environment variable, by specifying space or comma-delimited names.
All debug logs are sent to `stderr`.

Available names:
```
oo7-substrate:bonds
oo7-substrate:nodeService
oo7-substrate:secretStore
oo7-substrate:transact
```

Examples:

Log only nodeService:
```bash
DEBUG=oo7-substrate:nodeService node my-app.js
```

Log secretStore and transact output:
```bash
DEBUG=oo7-substrate:secretStore,oo7-substrate:transact node my-app.js
```

Log all oo7-substrate output:
```bash
DEBUG=oo7-substrate:* node my-apps.js
```

For a browser environment the configuration is instead stored in localStorage:

```shell
localStorage.debug = 'oo7-substrate:*'
```
