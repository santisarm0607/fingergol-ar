/* ============================================================
   Cámara: antes de abrir AR.js pedimos permiso nosotros mismos.
   Así, si algo falla (permiso negado, cámara ocupada, página sin
   https), mostramos un mensaje claro en español en vez de un
   error técnico. Luego soltamos la cámara para que AR.js la use.
   ============================================================ */
(function () {
  const FG = (window.FG = window.FG || {});

  function errorConCodigo(codigo, original) {
    const e = new Error(codigo);
    e.codigo = codigo;
    e.original = original;
    return e;
  }

  FG.Camara = {
    async verificar() {
      if (!window.isSecureContext) throw errorConCodigo('inseguro');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw errorConCodigo('sin-soporte');
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'environment' }
        });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const mapa = {
          NotAllowedError: 'permiso',
          SecurityError: 'permiso',
          NotFoundError: 'sin-camara',
          OverconstrainedError: 'sin-camara',
          NotReadableError: 'ocupada',
          AbortError: 'ocupada'
        };
        throw errorConCodigo(mapa[e.name] || 'desconocido', e);
      }
    }
  };
})();
