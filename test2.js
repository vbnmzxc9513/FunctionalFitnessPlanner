import * as DOMPurifyMod from 'dompurify';
console.log("default exists?", !!DOMPurifyMod.default);
if (DOMPurifyMod.default) {
    console.log("default sanitize:", typeof DOMPurifyMod.default.sanitize);
}
console.log("named sanitize:", typeof DOMPurifyMod.sanitize);
