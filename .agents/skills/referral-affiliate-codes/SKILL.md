---
name: referral-affiliate-codes
description: Reglas del sistema de códigos de referidos y afiliados en HazPost. Úsalo antes de modificar la generación de códigos, el campo de código en registro, o la validación de códigos de afiliado en el admin. Define los prefijos obligatorios R/A, la compatibilidad legacy HAZ, y el comportamiento del campo único inteligente.
---

# Sistema de Códigos R/A — HazPost

## Regla fundamental de prefijos

| Tipo | Prefijo obligatorio | Ejemplo |
|------|---------------------|---------|
| Referido (automático) | `R` | `R42A3F9C` |
| Afiliado (manual admin) | `A` | `AGENCIA-MED` → debe ser `AAGENCIA` o similar |
| Legacy referido (existentes) | `HAZ` | `HAZ42A3F9C` — solo compatibilidad backward |

**Regla irrenunciable**: Todo código nuevo debe empezar con R (referido) o A (afiliado). Esta regla aplica tanto a generación automática como a creación manual en el admin.

## Generación de códigos de referido

**Formato**: `R{userId}{randomHex6}`

```typescript
// artifacts/api-server/src/routes/referrals.ts
function generateReferralCode(userId: number): string {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `R${userId}${random}`;
}
```

Los códigos legacy con prefijo `HAZ` siguen siendo válidos en validación para no romper a usuarios existentes. NO generar nuevos con HAZ.

## Validación en registro (campo único)

El formulario de registro tiene **un solo campo** que detecta automáticamente el tipo:

- Empieza con `R` → código de referido
- Empieza con `HAZ` → código de referido (legacy, compatibilidad)
- Empieza con `A` → código de afiliado
- Cualquier otro prefijo → error: "El código debe empezar con R (referido) o A (afiliado)"

### Lógica de detección (frontend)

```typescript
function detectCodeType(code: string): "referral" | "affiliate" | "invalid" | "empty" {
  if (!code) return "empty";
  const upper = code.toUpperCase();
  if (upper.startsWith("R") || upper.startsWith("HAZ")) return "referral";
  if (upper.startsWith("A")) return "affiliate";
  return "invalid";
}
```

### Separación al enviar al backend

```typescript
// En register.tsx → goToStep2 o handleSubmit:
const codeType = detectCodeType(unifiedCode);
const referralCode = (codeType === "referral") ? unifiedCode : undefined;
const affiliateCode = (codeType === "affiliate") ? unifiedCode : undefined;
```

## Validación en admin de afiliados

Archivo: `artifacts/api-server/src/routes/admin/affiliate-codes.ts`

Al crear o editar un código de afiliado, el backend debe validar que el código empiece con `A`:

```typescript
if (!cleanCode.startsWith("A")) {
  return res.status(400).json({ error: "El código de afiliado debe empezar con la letra A" });
}
```

Esta validación va DESPUÉS de limpiar el código (`trim().toUpperCase().replace(...)`) y ANTES de verificar longitud.

## Compatibilidad backward (HAZ)

- Códigos HAZ existentes en `users.my_referral_code` son válidos indefinidamente
- La validación en `referrals.ts` busca en `my_referral_code` sin filtro de prefijo → HAZ sigue funcionando
- El campo único en el frontend también acepta HAZ como tipo "referral"
- NO migrar HAZ → R en producción (riesgo de romper links existentes compartidos)

## Archivos clave

- `artifacts/social-dashboard/src/pages/register.tsx` — campo único inteligente
- `artifacts/api-server/src/routes/referrals.ts` — función `generateReferralCode`
- `artifacts/api-server/src/routes/admin/affiliate-codes.ts` — validación prefijo A
- `artifacts/api-server/src/routes/user.ts` — manejo de referralCode y affiliateCode en registro
