import { state, layers } from './state.js';
import { setProgress, addLog, sleep, resetLogCount } from './utils.js';
import { map } from './map.js';
import { renderDirections, updateStats, showAlgoContent, updateRunBtn } from './ui.js';

export async function calculateRoute() {
  if (!state.src || !state.dst) return;
  
  state.running = true;
  updateRunBtn();
  showAlgoContent(true);
  resetLogCount();
  
  // Limpa camadas anteriores
  if (layers.route) { 
    map.removeLayer(layers.route); 
    layers.route = null;
  }
  layers.anim.forEach(l => map.removeLayer(l));
  layers.anim.length = 0;
  
  const logContainer = document.getElementById('logEntries');
  if (logContainer) logContainer.innerHTML = '';

  // Logs iniciais
  setProgress(5, 'Conectando ao servidor de rotas...');
  addLog('start', `Iniciando algoritmo <strong>A*</strong> + OSRM`);
  addLog('start', `Origem: <strong>${state.src.label.split(',')[0]}</strong>`);
  addLog('start', `Destino: <strong>${state.dst.label.split(',')[0]}</strong>`);
  addLog('start', `Modo: <strong>${{driving:'Carro 🚗',cycling:'Bicicleta 🚴',walking:'A pé 🚶'}[state.mode]}</strong>`);

  await sleep(300);
  setProgress(20, 'Buscando grafo de ruas (OSM)...');
  addLog('explore', 'Carregando grafo da rede viária OpenStreetMap');

  await sleep(400);
  setProgress(40, 'Executando Dijkstra...');
  addLog('explore', 'Expandindo nós da fila de prioridade');
  addLog('explore', 'Relaxando arestas do grafo...');

  const coords = `${state.src.lon},${state.src.lat};${state.dst.lon},${state.dst.lat}`;
  const profile = state.mode === 'driving' ? 'car' : state.mode === 'cycling' ? 'bike' : 'foot';
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || !data.routes.length) {
      addLog('path', '<strong>Nenhuma rota encontrada</strong> entre os pontos selecionados.');
      setProgress(0, 'Sem rota');
      state.running = false;
      updateRunBtn();
      return;
    }

    const route = data.routes[0];
    const distKm = (route.distance / 1000).toFixed(1);
    const durMin = Math.round(route.duration / 60);
    const speedAvg = Math.round(route.distance / route.duration * 3.6);
    const nodesEst = Math.round(route.distance / 80);

    setProgress(70, 'Caminho mais curto encontrado!');
    addLog('settle', `<strong>Caminho mínimo encontrado</strong> após ~${nodesEst} nós explorados`);
    addLog('settle', `Distância total: <strong>${distKm} km</strong>`);
    addLog('settle', `Duração estimada: <strong>${durMin} min</strong>`);

    await sleep(300);
    setProgress(90, 'Renderizando rota no mapa...');
    addLog('path', 'Traçando rota no mapa...');

    // Desenha rota com efeito
    drawRoute(route.geometry.coordinates);

    await sleep(400);
    setProgress(100, 'Rota calculada com sucesso!');
    addLog('done', `✅ <strong>Rota otimizada pronta!</strong> ${distKm} km • ${durMin} min`);

    // Atualiza estatísticas
    updateStats(distKm, durMin, nodesEst, speedAvg);

    // Renderiza direções
    renderDirections(route.legs[0]?.steps || []);

    // Ajusta mapa
    if (layers.route) {
      map.fitBounds(layers.route.getBounds(), { padding: [60, 80] });
    }

  } catch (e) {
    console.error('Erro na rota:', e);
    addLog('error', `<strong>Erro de conexão:</strong> ${e.message}`);
    setProgress(0, 'Erro');
  } finally {
    state.running = false;
    updateRunBtn();
  }
}

function drawRoute(coords) {
  const latlngs = coords.map(c => [c[1], c[0]]);

  // Shadow/glow effect
  const glow = L.polyline(latlngs, {
    color: '#00e5a0', weight: 10, opacity: 0.08, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);
  layers.anim.push(glow);

  const outer = L.polyline(latlngs, {
    color: '#00b8ff', weight: 5, opacity: 0.35, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);
  layers.anim.push(outer);

  layers.route = L.polyline(latlngs, {
    color: '#00e5a0', weight: 3, opacity: 0.95, lineCap: 'round', lineJoin: 'round'
  }).addTo(map);
}