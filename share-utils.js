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

function askUsername(onConfirm) {
  var shade = document.createElement("div");
  shade.setAttribute("role", "dialog");
  shade.setAttribute("aria-modal", "true");
  shade.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(10,10,9,0.55);display:flex;align-items:center;justify-content:center;";
  var box = document.createElement("div");
  box.style.cssText = "box-sizing:border-box;width:min(320px,84vw);background:var(--bg-2);color:var(--ink);border:1px solid var(--line-2);border-radius:12px;padding:20px;font:400 14px/1.4 var(--font-body);";
  var label = document.createElement("p");
  label.style.cssText = "margin:0 0 14px;font-weight:600;";
  label.textContent = "Enter your username for the share card:";
  var input = document.createElement("input");
  input.setAttribute("type", "text");
  input.setAttribute("value", "Player");
  input.setAttribute("maxlength", "40");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("enterkeyhint", "done");
  input.style.cssText = "box-sizing:border-box;width:100%;margin-bottom:16px;padding:10px 12px;font:16px/1.3 inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line-2);border-radius:8px;outline:none;caret-color:var(--accent);";
  var row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
  var cancel = document.createElement("button");
  cancel.setAttribute("type", "button");
  cancel.textContent = "Cancel";
  cancel.style.cssText = "padding:9px 14px;font:600 14px/1 inherit;color:var(--dim);background:transparent;border:1px solid var(--line-2);border-radius:8px;cursor:pointer;";
  var share = document.createElement("button");
  share.setAttribute("type", "button");
  share.textContent = "Share";
  share.style.cssText = "padding:9px 18px;font:600 14px/1 inherit;color:var(--bg);background:var(--accent);border:1px solid var(--accent);border-radius:8px;cursor:pointer;";
  var done = false;
  function finish(name) {
    if (done) return;
    done = true;
    var clean = (name || "").trim().slice(0, 40) || "Player";
    if (shade.parentNode) shade.parentNode.removeChild(shade);
    onConfirm(clean);
  }
  function cancelNow() {
    if (done) return;
    done = true;
    if (shade.parentNode) shade.parentNode.removeChild(shade);
    onConfirm(null);
  }
  share.onclick = function (ev) {
    ev.stopPropagation();
    input.blur(); // retract the soft keyboard before the share sheet presents
    finish(input.value);
  };
  cancel.onclick = function (ev) {
    ev.stopPropagation();
    cancelNow();
  };
  shade.addEventListener("click", cancelNow);
  input.addEventListener("keydown", function (ev) {
    ev.stopPropagation(); // keep game key handlers from reacting while typing
    if (ev.key === "Enter") { ev.preventDefault(); share.click(); }
    if (ev.key === "Escape") { cancelNow(); }
  });
  row.appendChild(cancel);
  row.appendChild(share);
  box.appendChild(label);
  box.appendChild(input);
  box.appendChild(row);
  shade.appendChild(box);
  document.body.appendChild(shade);
  input.focus();
  input.select();
}
