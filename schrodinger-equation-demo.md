# Schrödinger Equation Derivation

## Time-Dependent Schrödinger Equation

The fundamental equation of quantum mechanics can be derived from several principles including wave-particle duality and energy conservation.

### Starting from de Broglie Relations

For a particle with momentum p and energy E:
- λ = h/p (de Broglie wavelength)
- E = ℏω (Planck-Einstein relation)

### Wave Function Ansatz

Consider a plane wave solution:
ψ(x,t) = A exp[i(kx - ωt)]

where k = p/ℏ and ω = E/ℏ

### Taking Derivatives

First spatial derivative:
∂ψ/∂x = ikψ = (ip/ℏ)ψ

Second spatial derivative:
∂²ψ/∂x² = -k²ψ = -(p²/ℏ²)ψ

Time derivative:
∂ψ/∂t = -iωψ = -(iE/ℏ)ψ

### Classical Energy Relation

For a particle in a potential V(x):
E = p²/(2m) + V(x)

### Operator Correspondence

From the derivatives above:
- p̂ψ = -iℏ ∂ψ/∂x
- p̂²ψ = -ℏ² ∂²ψ/∂x²
- Êψ = iℏ ∂ψ/∂t

### Substituting into Energy Relation

E = p²/(2m) + V(x)

Operating on ψ:
iℏ ∂ψ/∂t = [-ℏ²/(2m) ∂²/∂x² + V(x)]ψ

This gives the **time-dependent Schrödinger equation**:
iℏ ∂ψ/∂t = Ĥψ

where Ĥ = -ℏ²/(2m) ∇² + V(r⃗) is the Hamiltonian operator.

## Time-Independent Case

For stationary states with definite energy E:
ψ(x,t) = φ(x)e^(-iEt/ℏ)

Substituting into time-dependent equation:
iℏ(-iE/ℏ)φ(x)e^(-iEt/ℏ) = Ĥφ(x)e^(-iEt/ℏ)

Simplifying:
Eφ(x) = Ĥφ(x)

This is the **time-independent Schrödinger equation**:
Ĥφ = Eφ

### Interpretation

- ψ(x,t): quantum state of the particle
- |ψ(x,t)|²: probability density
- E: energy eigenvalues
- φ(x): energy eigenfunctions

### Normalization Condition

∫_{-∞}^{∞} |ψ(x,t)|² dx = 1

### Boundary Conditions

For bound states:
- ψ → 0 as x → ±∞
- ψ and dψ/dx continuous

### Extensions

**3D Case:**
iℏ ∂ψ/∂t = [-ℏ²/(2m) ∇² + V(r⃗)]ψ

**Many-Particle Systems:**
iℏ ∂Ψ/∂t = [∑ᵢ (-ℏ²/(2mᵢ))∇ᵢ² + V(r₁,r₂,...)]Ψ

**Relativistic Extension:**
Leads to Dirac equation and Klein-Gordon equation

## Applications

The Schrödinger equation enables calculation of:
- Energy levels in atoms and molecules
- Tunneling probabilities
- Scattering cross-sections
- Chemical bonding properties
- Solid state electronic structure