import Constants from "../packages/runtime-svc/constants";

for (const [key, val] of Object.entries(Constants)) {
    console.log(key, val)
}