function xorString(str, key) {
  var out = [];
  var k = key || "silenz";
  for (var i = 0; i < str.length; i++) {
    out.push(String.fromCharCode(str.charCodeAt(i) ^ k.charCodeAt(i % k.length)));
  }
  return out.join("");
}

function b64UrlEncode(str) {
  var b64 = btoa(str);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(str) {
  try {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    var pad = 4 - (str.length % 4);
    if (pad !== 4) str += "=".repeat(pad);
    return atob(str);
  } catch (e) {
    return null;
  }
}

function obfuscateShare(payloadObj) {
  var payload = JSON.stringify(payloadObj);
  var obf = xorString(payload, "silenz");
  return b64UrlEncode(unescape(encodeURIComponent(obf)));
}

function deobfuscateShare(token) {
  if (!token) return null;
  try {
    var obf = b64UrlDecode(token);
    if (!obf) return null;
    var decoded = decodeURIComponent(escape(xorString(obf, "silenz")));
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}
