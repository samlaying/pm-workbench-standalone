const CDN = 'https://esm.sh';
let mounted;

function makeElements(cards, ReactLib) {
  const { convertToExcalidrawElements } = ReactLib;
  return cards.map((card, index) => {
    const x = Number(card.x) || 80 + (index % 3) * 480;
    const y = Number(card.y) || 80 + Math.floor(index / 3) * 300;
    const text = `${card.title}\n\n${String(card.body || '').slice(0, 1200)}`;
    return convertToExcalidrawElements([
      { type: 'rectangle', x, y, width: 420, height: 240, strokeColor: '#98a2b3', backgroundColor: '#fffdf7', fillStyle: 'solid', roughness: 1, roundness: { type: 3 } },
      { type: 'text', x: x + 18, y: y + 18, text, fontSize: 16, fontFamily: 1, strokeColor: '#172033' },
    ]);
  }).flat();
}

export async function mountExcalidraw(container, cards, scene, onChange) {
  if (mounted) mounted.unmount();
  const [React, ReactDOM, ExcalidrawModule] = await Promise.all([
    import(`${CDN}/react@18.3.1`),
    import(`${CDN}/react-dom@18.3.1/client`),
    import(`${CDN}/@excalidraw/excalidraw@0.18.1?deps=react@18.3.1,react-dom@18.3.1`),
  ]);
  const { Excalidraw } = ExcalidrawModule;
  const root = ReactDOM.createRoot(container);
  const initialElements = scene?.elements?.length ? scene.elements : makeElements(cards, ExcalidrawModule);
  const initialData = { elements: initialElements, appState: scene?.appState || { viewBackgroundColor: '#f7f8fb' }, files: scene?.files || {} };
  root.render(React.createElement(Excalidraw, {
    initialData,
    theme: 'light',
    UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } } },
    onChange: (elements, appState, files) => onChange({ elements, appState, files }),
  }));
  mounted = { unmount: () => root.unmount() };
}
