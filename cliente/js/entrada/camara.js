/* ============================================================
   Cámara: pide permiso y conecta el video al elemento <video>.
   Los errores salen con un código para mostrar mensajes claros.
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
    stream: null,

    async iniciar(video) {
      if (!window.isSecureContext) throw errorConCodigo('inseguro');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw errorConCodigo('sin-soporte');
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
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
      this.stream = stream;
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute('playsinline', '');
      try {
        await video.play();
      } catch (e) { /* algunos navegadores reproducen solos */ }
      await new Promise((resolver) => {
        if (video.readyState >= 2 && video.videoWidth) return resolver();
        video.addEventListener('loadeddata', () => resolver(), { once: true });
        setTimeout(resolver, 4000);
      });
      return stream;
    },

    detener() {
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  };
})();
