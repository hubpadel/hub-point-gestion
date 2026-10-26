// Exclusivamente cambios permitidos del circuito Asistencia en el HTML original.
module.exports=html=>html
 .replace('<option>Clase a recuperar</option>','')
 .replace('<option value="Recupera" hidden>Recupera (anterior)</option>','<option>Recupera</option>')
 .replace('if(window.PointRecuperaciones&&await window.PointRecuperaciones.guardarAsistencia())return;','')
 .replace(/\r?\n  window.dispatchEvent\(new Event\('point:agenda'\)\);/,'')
 .replace('planner.js?v=20261026-asistencia','planner.js?v=20261026-recuperar')
 .replace('recuperaciones.js?v=20261026-asistencia','recuperaciones.js?v=20261026')
 .replace('recuperaciones.css?v=20261026-asistencia','recuperaciones.css?v=20261026');
