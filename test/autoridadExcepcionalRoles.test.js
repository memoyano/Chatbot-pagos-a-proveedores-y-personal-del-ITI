const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ROLES_AUTORIDAD_EXCEPCIONAL,
} = require("../src/config/roles");

test("pago excepcional admite únicamente las cuatro autoridades definidas por ITI", () => {
  assert.deepEqual(
    ROLES_AUTORIDAD_EXCEPCIONAL,
    [
      "rector",
      "director_general",
      "vicerector_postgrado",
      "vicerector_financiero",
    ]
  );
});

test("coordinador general ya no autoriza pagos excepcionales", () => {
  assert.equal(
    ROLES_AUTORIDAD_EXCEPCIONAL.includes("coordinador_general"),
    false
  );
});