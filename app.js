/* Mis gastos: app de sólo lectura. Descarga datos.enc (cifrado en el PC), lo descifra con tu
   contraseña en el propio iPhone y enseña resúmenes y gráficas. No envía nada a ningún sitio. */
"use strict";

const CLAVE_PASS = "gastos.pass";
const CLAVE_DATOS = "gastos.enc";
const $ = (s, el = document) => el.querySelector(s);
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });
const fmt = (n) => eur.format(n || 0);
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ICONOS = {
  "Supermercado": "🛒", "Restauración": "🍽️", "Gasolina": "⛽", "Ocio": "🎟️", "Transporte": "🚗",
  "Suscripciones": "🔁", "Cuidado personal": "💈", "Compras": "🛍️", "Efectivo": "💶", "Otros": "•",
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

let D = null;            // datos descifrados
let iMes = 0;            // índice del mes seleccionado
let vista = "resumen";
let filtroCat = "Todas";

/* ------------------------------------------------------------------ */
/* Datos: descarga + descifrado                                        */
/* ------------------------------------------------------------------ */
async function obtenerSobre() {
  try {
    const r = await fetch("datos.enc?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) {
      const txt = await r.text();
      lsSet(CLAVE_DATOS, txt);
      return JSON.parse(txt);
    }
  } catch {}
  const guardado = lsGet(CLAVE_DATOS);            // sin conexión: últimos datos descargados
  if (guardado) return JSON.parse(guardado);
  throw new Error("sin-datos");
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function descifrar(sobre, pass) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const clave = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(sobre.salt), iterations: sobre.iter },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(sobre.iv) }, clave, b64(sobre.ct));
  return JSON.parse(new TextDecoder().decode(plano));
}

async function entrar(pass, recordar) {
  const btn = $("#btn-entrar"), err = $("#error-pin");
  btn.disabled = true; btn.textContent = "Abriendo…"; err.textContent = "";
  try {
    const sobre = await obtenerSobre();
    try { D = await descifrar(sobre, pass); }
    catch { throw new Error("pass"); }
    if (recordar) lsSet(CLAVE_PASS, pass); else lsDel(CLAVE_PASS);
    iMes = Math.max(0, D.meses.length - 1);
    $("#bloqueo").hidden = true; $("#app").hidden = false;
    pintar();
  } catch (e) {
    lsDel(CLAVE_PASS);
    err.textContent = e.message === "pass" ? "Contraseña incorrecta." :
      e.message === "sin-datos" ? "Todavía no hay datos. Se publican el domingo desde el PC." :
      "No he podido abrir los datos.";
    $("#bloqueo").hidden = false; $("#app").hidden = true;
  } finally {
    btn.disabled = false; btn.textContent = "Entrar";
  }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const fechaCorta = (iso) => { const [a, m, d] = iso.split("-"); return `${+d} ${MESES_C[m - 1]}`; };
const fechaLarga = (iso) => new Date(iso + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const mesCorto = (clave) => MESES_C[(clave % 100) - 1];
const mesSel = () => D.meses[iMes];

function tooltipEn(el) {
  const tip = $("#tooltip");
  const mostrar = (ev) => {
    const t = ev.target.closest("[data-tip]");
    if (!t) return;
    ev.preventDefault?.();
    tip.innerHTML = t.dataset.tip;
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.top - h - 8;
    if (y < 70) y = r.bottom + 8;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    clearTimeout(tooltipEn.t);
    tooltipEn.t = setTimeout(() => (tip.hidden = true), 2600);
  };
  el.addEventListener("click", mostrar);
  el.addEventListener("mouseover", mostrar);
}
document.addEventListener("scroll", () => ($("#tooltip").hidden = true), { passive: true });

function escala(max) {   // máximo "bonito" del eje y sus marcas
  if (max <= 0) return { top: 10, marcas: [0, 5, 10] };
  const paso0 = max / 4, mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= paso0);
  const top = Math.ceil(max / paso) * paso;
  const marcas = []; for (let v = 0; v <= top + 1e-9; v += paso) marcas.push(v);
  return { top, marcas };
}

function tablaToggle(id, cab, filas) {
  return `<button class="tabla-toggle" data-tabla="${id}">Ver como tabla</button>
  <table class="datos" id="${id}" hidden><thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
  <tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/* ------------------------------------------------------------------ */
/* Pintado                                                             */
/* ------------------------------------------------------------------ */
const TITULOS = { resumen: "Resumen", graficas: "Gráficas", gastos: "Gastos", bizum: "Bizum excluidos", ingresos: "Ingresos" };

function pintar() {
  const m = mesSel();
  $("#titulo").textContent = TITULOS[vista];
  $("#mes-nombre").textContent = m.nombre;
  $("#mes-ant").disabled = iMes === 0;
  $("#mes-sig").disabled = iMes === D.meses.length - 1;
  $("#selector-mes").hidden = vista === "graficas";
  const g = new Date(D.generado);
  $("#actualizado").textContent = "Datos actualizados el " +
    g.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) + " a las " +
    g.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  document.querySelectorAll(".vista").forEach((v) => (v.hidden = v.dataset.vista !== vista));
  document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.ir === vista));
  const el = $(`[data-vista="${vista}"]`);
  el.innerHTML = { resumen: vResumen, graficas: vGraficas, gastos: vGastos, bizum: vBizum, ingresos: vIngresos }[vista](m);
}

/* ---------- Resumen ---------- */
function vResumen(m) {
  const pasado = m.margen < 0;
  const usado = m.presupuesto > 0 ? m.total / m.presupuesto : 0;
  const hoy = new Date();
  const claveHoy = hoy.getFullYear() * 100 + hoy.getMonth() + 1;
  let diario = "";
  if (m.mes === claveHoy && !pasado) {
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const quedan = finMes - hoy.getDate() + 1;
    diario = `<div class="diario">Quedan <b>${quedan} días</b> de mes: puedes gastar <b>${fmt(m.margen / quedan)}</b> al día.</div>`;
  }
  const cats = Object.entries(m.categorias).sort((a, b) => b[1] - a[1]);
  const maxC = cats.length ? cats[0][1] : 1;
  return `
  <div class="tarjeta heroe">
    <div class="etq">${pasado ? "Te has pasado del presupuesto en" : "Te queda para gastar"}</div>
    <div class="cifra" style="color:${pasado ? "var(--mal)" : "var(--texto)"}">${fmt(Math.abs(m.margen))}</div>
    <span class="estado ${pasado ? "mal" : "bien"}">${pasado ? "✕ Por encima del presupuesto" : "✓ Dentro del presupuesto"}</span>
    <div class="medidor ${pasado ? "mal" : ""}" role="img" aria-label="${pct.format(usado)} del presupuesto usado">
      <div style="width:${Math.min(100, usado * 100).toFixed(1)}%"></div></div>
    <div class="medidor-pie"><span>Gastado ${fmt(m.total)}</span><span>${pct.format(usado)} de ${fmt(m.presupuesto)}</span></div>
    ${diario}
  </div>

  <div class="kpis">
    <div class="kpi"><div class="etq">Gastos fijos</div><div class="val">${fmt(m.fijo)}</div><div class="nota">Suscripciones</div></div>
    <div class="kpi"><div class="etq">Gastos variables</div><div class="val">${fmt(m.variable)}</div><div class="nota">El resto</div></div>
    <div class="kpi"><div class="etq">Otros ingresos</div><div class="val">${fmt(m.otros)}</div><div class="nota">Se suman al presupuesto</div></div>
    <div class="kpi"><div class="etq">Compensado con Bizum</div><div class="val">${fmt(m.compensado)}</div><div class="nota">No cuenta como gasto</div></div>
  </div>

  <div class="tarjeta">
    <h2>Presupuesto del mes</h2>
    <p class="sub">${pct.format(D.reparto.gastos)} del salario más lo que entra aparte de la nómina</p>
    <div class="desglose">
      <div class="fila"><span>${pct.format(D.reparto.gastos)} de ${fmt(D.salario)}</span><span>${fmt(m.base)}</span></div>
      <div class="fila"><span>+ Otros ingresos</span><span>${fmt(m.otros)}</span></div>
      <div class="fila total"><span>Presupuesto</span><span>${fmt(m.presupuesto)}</span></div>
      <div class="fila"><span>− Gastado</span><span>${fmt(m.total)}</span></div>
      <div class="fila total"><span>${pasado ? "Exceso" : "Margen"}</span><span style="color:${pasado ? "var(--mal)" : "var(--bien)"}">${fmt(m.margen)}</span></div>
    </div>
  </div>

  <div class="tarjeta">
    <h2>Gasto por categoría</h2>
    <p class="sub">${m.nombre}</p>
    ${cats.length ? `<div class="hbarras">${cats.map(([c, v]) => `
      <div class="hb"><span>${ICONOS[c] || "•"} ${esc(c)}</span><span class="imp">${fmt(v)}<span class="pct">${pct.format(m.total ? v / m.total : 0)}</span></span>
      <div class="pista"><div style="width:${(v / maxC * 100).toFixed(1)}%"></div></div></div>`).join("")}</div>`
      : `<div class="vacio">Sin gastos este mes.</div>`}
  </div>`;
}

/* ---------- Gráficas ---------- */
function vGraficas() {
  const ms = D.meses.slice(-12);
  return `
  <div class="tarjeta grafica">
    <h2>Gasto frente a presupuesto</h2>
    <p class="sub">Por mes · toca una barra para ver el detalle</p>
    <div class="leyenda"><span><i style="background:var(--serie-1)"></i>Gastado</span><span><i class="raya" style="background:var(--texto)"></i>Presupuesto</span></div>
    ${svgGastoVsPres(ms)}
    ${tablaToggle("t1", ["Mes", "Gastado", "Presupuesto", "Margen"], ms.map((m) => [m.nombre, fmt(m.total), fmt(m.presupuesto), fmt(m.margen)]))}
  </div>

  <div class="tarjeta grafica">
    <h2>Ritmo de gasto del mes</h2>
    <p class="sub">${mesSel().nombre} · gasto acumulado día a día</p>
    <div class="leyenda"><span><i class="raya" style="background:var(--serie-1)"></i>Acumulado</span><span><i class="raya" style="background:var(--texto-2)"></i>Presupuesto</span></div>
    ${svgAcumulado(mesSel())}
  </div>

  <div class="tarjeta grafica">
    <h2>Ingresos y gastos</h2>
    <p class="sub">Por mes · ingresos incluye nómina y otros</p>
    <div class="leyenda"><span><i style="background:var(--serie-1)"></i>Gastos</span><span><i style="background:var(--serie-2)"></i>Ingresos</span></div>
    ${svgIngVsGas(ms)}
    ${tablaToggle("t3", ["Mes", "Ingresos", "Gastos", "Diferencia"], ms.map((m) => [m.nombre, fmt(m.nomina + m.otros), fmt(m.total), fmt(m.nomina + m.otros - m.total)]))}
  </div>

  <div class="tarjeta grafica">
    <h2>Categorías mes a mes</h2>
    <p class="sub">Últimos meses</p>
    ${tablaCategorias(ms.slice(-4))}
  </div>`;
}

const W = 340, H = 200, PL = 44, PR = 8, PT = 10, PB = 24;

function ejeY(top, marcas) {
  const y = (v) => PT + (H - PT - PB) * (1 - v / top);
  return { y, svg: marcas.map((v) => `<line class="rejilla" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/>
    <text x="${PL - 6}" y="${y(v) + 3.5}" text-anchor="end">${eur0.format(v)}</text>`).join("") };
}

function svgGastoVsPres(ms) {
  if (!ms.length) return `<div class="vacio">Sin datos</div>`;
  const { top, marcas } = escala(Math.max(...ms.map((m) => Math.max(m.total, m.presupuesto))));
  const { y, svg } = ejeY(top, marcas);
  const banda = (W - PL - PR) / ms.length, bw = Math.min(28, banda * 0.5);
  let s = svg;
  ms.forEach((m, i) => {
    const cx = PL + banda * (i + 0.5), x = cx - bw / 2, yt = y(m.total), y0 = y(0);
    const h = Math.max(0, y0 - yt), r = Math.min(4, h, bw / 2);
    const tip = `<b>${esc(m.nombre)}</b><br>Gastado ${fmt(m.total)}<br>Presupuesto ${fmt(m.presupuesto)}<br>${m.margen < 0 ? "Exceso" : "Margen"} ${fmt(m.margen)}`;
    s += h > 0 ? `<path class="s1" d="M${x},${y0} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${y0} Z"/>` : "";
    s += `<line class="marca-pres" x1="${cx - bw / 2 - 5}" x2="${cx + bw / 2 + 5}" y1="${y(m.presupuesto)}" y2="${y(m.presupuesto)}"/>`;
    s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${mesCorto(m.mes)}</text>`;
    s += `<rect class="hit" x="${PL + banda * i}" y="${PT}" width="${banda}" height="${H - PT - PB}" data-tip="${esc(tip)}"/>`;
  });
  s += `<line class="eje" x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto frente a presupuesto por mes">${s}</svg>`;
}

function svgIngVsGas(ms) {
  if (!ms.length) return `<div class="vacio">Sin datos</div>`;
  const { top, marcas } = escala(Math.max(...ms.map((m) => Math.max(m.total, m.nomina + m.otros))));
  const { y, svg } = ejeY(top, marcas);
  const banda = (W - PL - PR) / ms.length, bw = Math.min(20, banda * 0.32);
  const barra = (x, v, cls) => {
    const yt = y(v), y0 = y(0), h = Math.max(0, y0 - yt), r = Math.min(4, h, bw / 2);
    return h > 0 ? `<path class="${cls}" d="M${x},${y0} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${y0} Z"/>` : "";
  };
  let s = svg;
  ms.forEach((m, i) => {
    const cx = PL + banda * (i + 0.5), ing = m.nomina + m.otros;
    s += barra(cx - bw - 1, m.total, "s1") + barra(cx + 1, ing, "s2");
    s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${mesCorto(m.mes)}</text>`;
    const tip = `<b>${esc(m.nombre)}</b><br>Ingresos ${fmt(ing)}<br>· nómina ${fmt(m.nomina)}<br>· otros ${fmt(m.otros)}<br>Gastos ${fmt(m.total)}`;
    s += `<rect class="hit" x="${PL + banda * i}" y="${PT}" width="${banda}" height="${H - PT - PB}" data-tip="${esc(tip)}"/>`;
  });
  s += `<line class="eje" x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">${s}</svg>`;
}

function svgAcumulado(m) {
  const a = Math.floor(m.mes / 100), mm = m.mes % 100;
  const dias = new Date(a, mm, 0).getDate();
  const hoy = new Date(), claveHoy = hoy.getFullYear() * 100 + hoy.getMonth() + 1;
  const hasta = m.mes === claveHoy ? hoy.getDate() : m.mes < claveHoy ? dias : 0;
  const porDia = new Array(dias + 1).fill(0);
  D.gastos.filter((g) => g.mes === m.mes).forEach((g) => (porDia[+g.f.slice(8, 10)] += g.imp));
  const acum = []; let t = 0;
  for (let d = 1; d <= hasta; d++) { t += porDia[d]; acum.push([d, t]); }
  const { top, marcas } = escala(Math.max(m.presupuesto, t));
  const { y, svg } = ejeY(top, marcas);
  const x = (d) => PL + (W - PL - PR) * (d - 1) / Math.max(1, dias - 1);
  let s = svg;
  s += `<line class="lref" x1="${x(1)}" x2="${x(dias)}" y1="${y(m.presupuesto)}" y2="${y(m.presupuesto)}"/>`;
  s += `<text x="${W - PR}" y="${y(m.presupuesto) - 5}" text-anchor="end">Presupuesto ${eur0.format(m.presupuesto)}</text>`;
  if (acum.length) {
    s += `<path class="l1" d="${acum.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`;
    const [dl, vl] = acum[acum.length - 1];
    s += `<circle cx="${x(dl)}" cy="${y(vl)}" r="4.5" fill="var(--serie-1)" stroke="var(--tarjeta)" stroke-width="2"/>`;
    const paso = (W - PL - PR) / Math.max(1, dias - 1);
    acum.forEach(([d, v]) => {
      s += `<rect class="hit" x="${x(d) - paso / 2}" y="${PT}" width="${paso}" height="${H - PT - PB}" data-tip="<b>${d} ${MESES_C[mm - 1]}</b><br>Gastado ese día ${fmt(porDia[d])}<br>Acumulado ${fmt(v)}"/>`;
    });
  }
  [1, 8, 15, 22, dias].forEach((d) => (s += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`));
  s += `<line class="eje" x1="${PL}" x2="${W - PR}" y1="${y(0)}" y2="${y(0)}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado del mes">${s}</svg>`;
}

function tablaCategorias(ms) {
  const cats = [...new Set(ms.flatMap((m) => Object.keys(m.categorias)))]
    .sort((a, b) => ms.reduce((s, m) => s + (m.categorias[b] || 0), 0) - ms.reduce((s, m) => s + (m.categorias[a] || 0), 0));
  if (!cats.length) return `<div class="vacio">Sin gastos</div>`;
  return `<table class="datos"><thead><tr><th>Categoría</th>${ms.map((m) => `<th>${mesCorto(m.mes)}</th>`).join("")}</tr></thead><tbody>
  ${cats.map((c) => `<tr><td>${ICONOS[c] || "•"} ${esc(c)}</td>${ms.map((m) => `<td>${m.categorias[c] ? eur0.format(m.categorias[c]) : "–"}</td>`).join("")}</tr>`).join("")}
  <tr><td><b>Total</b></td>${ms.map((m) => `<td><b>${eur0.format(m.total)}</b></td>`).join("")}</tr></tbody></table>`;
}

/* ---------- Gastos ---------- */
function vGastos(m) {
  const delMes = D.gastos.filter((g) => g.mes === m.mes);
  const cats = ["Todas", ...[...new Set(delMes.map((g) => g.cat))].sort()];
  if (!cats.includes(filtroCat)) filtroCat = "Todas";
  const lista = delMes.filter((g) => filtroCat === "Todas" || g.cat === filtroCat).sort((a, b) => b.f.localeCompare(a.f));
  const total = lista.reduce((s, g) => s + g.imp, 0);
  let html = `<div class="chips">${cats.map((c) => `<button class="chip ${c === filtroCat ? "activa" : ""}" data-cat="${esc(c)}">${c === "Todas" ? "Todas" : (ICONOS[c] || "") + " " + esc(c)}</button>`).join("")}</div>`;
  if (!lista.length) return html + `<div class="lista"><div class="vacio">Sin gastos.</div></div>`;
  html += `<div class="lista">`;
  let dia = "";
  for (const g of lista) {
    if (g.f !== dia) { dia = g.f; html += `<div class="dia">${fechaLarga(g.f)}</div>`; }
    html += `<div class="item"><div class="ico">${ICONOS[g.cat] || "•"}</div><div class="txt"><div class="t1">${esc(g.c)}</div>
      <div class="t2">${esc(g.cat)} · ${g.tipo}${g.o === "Manual" ? " · Manual" : ""}</div></div><div class="imp">${fmt(-g.imp)}</div></div>`;
  }
  return html + `<div class="total-lista"><span>Total${filtroCat !== "Todas" ? " " + esc(filtroCat) : ""}</span><span>${fmt(total)}</span></div></div>`;
}

/* ---------- Bizum ---------- */
function vBizum(m) {
  const pares = D.excluidos.filter((x) => x.mes === m.mes);
  let html = `<div class="aviso">Gastos que no cuentan porque te los devolvieron por Bizum. Si alguno está mal, cámbialo a <b>No</b> en la hoja «Bizum excluidos» del Excel del PC; se verá aquí el domingo.</div>`;
  if (!pares.length) return html + `<div class="lista"><div class="vacio">No hay Bizum excluidos este mes.</div></div>`;
  const activos = pares.filter((p) => p.decision !== "No");
  html += `<div class="kpis"><div class="kpi"><div class="etq">Gastos compensados</div><div class="val">${activos.length}</div></div>
    <div class="kpi"><div class="etq">Importe que no cuenta</div><div class="val">${fmt(activos.reduce((s, p) => s + p.ig, 0))}</div></div></div>`;
  for (const p of pares) {
    const rech = p.decision === "No";
    const badge = rech ? `<span class="badge no">No: el gasto cuenta</span>` : p.decision === "Sí" ? `<span class="badge si">Confirmado</span>` : `<span class="badge">Automático</span>`;
    html += `<div class="par ${rech ? "rechazado" : ""}">
      <div class="lado"><div class="c"><div class="tachado">${esc(p.cg)}</div><div class="f">Gasto · ${fechaCorta(p.fg)}</div></div><div class="imp">${fmt(-p.ig)}</div></div>
      <div class="flecha">compensado con</div>
      <div class="lado"><div class="c"><div>${esc(p.cb)}</div><div class="f">Bizum · ${fechaCorta(p.fb)}</div></div><div class="imp" style="color:var(--bien)">+${fmt(p.ib)}</div></div>
      <div class="pie"><span>${esc(p.motivo)}</span>${badge}</div></div>`;
  }
  return html;
}

/* ---------- Ingresos ---------- */
function vIngresos(m) {
  const lista = D.ingresos.filter((i) => i.mes === m.mes).sort((a, b) => b.f.localeCompare(a.f));
  const total = lista.reduce((s, i) => s + i.imp, 0);
  let html = `<div class="kpis"><div class="kpi"><div class="etq">Nómina</div><div class="val">${fmt(m.nomina)}</div></div>
    <div class="kpi"><div class="etq">Otros ingresos</div><div class="val">${fmt(m.otros)}</div><div class="nota">Suman al presupuesto</div></div></div>`;
  if (!lista.length) return html + `<div class="lista"><div class="vacio">Sin ingresos este mes.</div></div>`;
  html += `<div class="lista">`;
  for (const i of lista) {
    const ico = i.tipo === "Nómina" ? "💼" : i.tipo.startsWith("Bizum") ? "📲" : "➕";
    html += `<div class="item"><div class="ico">${ico}</div><div class="txt"><div class="t1">${esc(i.c)}</div>
      <div class="t2">${esc(i.tipo)} · ${fechaCorta(i.f)}</div></div><div class="imp pos">+${fmt(i.imp)}</div></div>`;
  }
  return html + `<div class="total-lista"><span>Total ingresos</span><span>${fmt(total)}</span></div></div>`;
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */
$("#form-pin").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#pin").blur();
  entrar($("#pin").value, $("#recordar").checked);
});
$("#btn-salir").addEventListener("click", () => {
  lsDel(CLAVE_PASS); D = null; $("#pin").value = "";
  $("#app").hidden = true; $("#bloqueo").hidden = false;
});
$("#mes-ant").addEventListener("click", () => { if (iMes > 0) { iMes--; pintar(); } });
$("#mes-sig").addEventListener("click", () => { if (iMes < D.meses.length - 1) { iMes++; pintar(); } });
document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => {
  vista = b.dataset.ir; pintar(); window.scrollTo(0, 0);
}));
$(".contenido").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-cat]");
  if (chip) { filtroCat = chip.dataset.cat; pintar(); return; }
  const tb = e.target.closest("[data-tabla]");
  if (tb) { const t = document.getElementById(tb.dataset.tabla); t.hidden = !t.hidden; tb.textContent = t.hidden ? "Ver como tabla" : "Ocultar tabla"; }
});
tooltipEn($(".contenido"));

// Al volver a la app después de un rato, recarga por si hay datos nuevos del domingo
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && D) {
    const pass = lsGet(CLAVE_PASS);
    if (pass) obtenerSobre().then((s) => s.generado !== D.generado ? descifrar(s, pass) : null)
      .then((nuevo) => { if (nuevo) { D = nuevo; iMes = D.meses.length - 1; pintar(); } }).catch(() => {});
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

const guardada = lsGet(CLAVE_PASS);
if (guardada) { $("#recordar").checked = true; entrar(guardada, true); }
