const authService = require("../../domains/autenticacion/auth.service");
const { iniciarAutenticacion } = require("../flows/auth.flow");

function authMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return next();

    if (ctx.session.flow === "auth") return next();

    if (ctx.session.usuario) {
      ctx.state.usuario = ctx.session.usuario;
      return next();
    }

    const usuarioDb = await authService.obtenerUsuarioAutenticado(String(ctx.from.id));
    if (usuarioDb) {
      ctx.session.usuario = {
        cedulaRuc: usuarioDb.cedulaRuc,
        nombre: usuarioDb.nombre,
        rol: usuarioDb.rol,
      };
      ctx.state.usuario = ctx.session.usuario;
      return next();
    }

    return iniciarAutenticacion(ctx);
  };
}

function requireRol(...rolesPermitidos) {
  return (ctx, next) => {
    if (!rolesPermitidos.includes(ctx.state.usuario?.rol)) {
      return ctx.reply(
        `⛔ Este comando es exclusivo para: ${rolesPermitidos.join(", ")}.`
      );
    }
    return next();
  };
}

module.exports = { authMiddleware, requireRol };
