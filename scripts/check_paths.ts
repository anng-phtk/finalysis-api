import Constants from "../packages/runtime-svc/constants.js";

for (const [key, val] of Object.entries(Constants)) {
    console.log(key, val)
}