/**
 * Blink Pattern Explorer
 * A visualization tool for different LED blink patterns
 */

(function() {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    /** @type {Object.<string, bigint>} */
    const LCG_PARAMS = {
        /** Multiplier from MMIX by Donald Knuth */
        A: 6364136223846793005n,
        /** Increment from MMIX by Donald Knuth */
        C: 1442695040888963407n,
        /** Modulus 2^64 */
        M: 2n ** 64n
    };

    /** @type {Object.<string, number>} */
    const TIMER_PARAMS = {
        /** Target frames per second */
        FPS: 60,
        /** Frame interval in milliseconds */
        FRAME_INTERVAL: 1000 / 60,
        /** Time scale factor for pattern animations */
        TIME_SCALE: 0.01
    };

    /** @type {Object.<string, number>} */
    const CANDLE_PARAMS = {
        /** Minimum intensity for candle flicker */
        MIN_INTENSITY: 0.6,
        /** Maximum intensity for candle flicker */
        MAX_INTENSITY: 1.0,
        /** Base intensity for candle */
        BASE_INTENSITY: 0.8,
        /** Intensity range for flicker */
        FLICKER_RANGE: 0.2,
        /** Center intensity for random walk (75%) */
        CENTER_INTENSITY: 0.75
    };

    /** @type {Object.<string, number>} */
    const LFSR_PARAMS = {
        /** Default LFSR seed */
        DEFAULT_SEED: 0x81,
        /** Low-pass filter coefficient */
        FILTER_ALPHA: 0.25,
        /** Minimum brightness for LFSR candle */
        MIN_BRIGHTNESS: 0.6,
        /** Maximum brightness for LFSR candle */
        MAX_BRIGHTNESS: 1.0
    };

    /** @type {Object.<string, number>} */
    const OSCILLATOR_PARAMS = {
        /** Fundamental candle flicker frequency in Hz */
        FREQUENCY: 10.0,
        /** Damping coefficient */
        DAMPING: 0.92,
        /** Delta time for 60Hz update rate */
        DELTA_TIME: 1.0 / 60.0,
        /** Chance of random disturbance per frame */
        DISTURBANCE_CHANCE: 0.05,
        /** Magnitude of random kick */
        KICK_MAGNITUDE: 15
    };

    /** @type {Object.<string, number>} */
    const RANDOM_WALK_PARAMS = {
        /** Starting brightness (75% = 191/255) */
        START_BRIGHTNESS: 191,
        /** Minimum brightness */
        MIN_BRIGHTNESS: 150,
        /** Maximum brightness */
        MAX_BRIGHTNESS: 240,
        /** Small step range [-5, 5] */
        SMALL_STEP_RANGE: 11,
        /** Large step range [-20, 25] */
        LARGE_STEP_RANGE: 46,
        /** Large step chance */
        LARGE_STEP_CHANCE: 0.02
    };

    // ============================================
    // PRNG Interface
    // ============================================

    /**
     * Abstract base class for Pseudo-Random Number Generators
     */
    class PRNG {
        /**
         * Generate next random number in [0, 1)
         * @returns {number} Random value between 0 (inclusive) and 1 (exclusive)
         */
        next() {
            throw new Error('Method next() must be implemented');
        }

        /**
         * Generate next random integer in [0, max)
         * @param {number} max - Upper bound (exclusive)
         * @returns {number} Random integer in [0, max)
         */
        nextInt(max) {
            return Math.floor(this.next() * max);
        }

        /**
         * Reset the PRNG state
         * @param {bigint|number} [seed] - New seed value (implementation-specific default if not provided)
         */
        reset(seed) {
            throw new Error('Method reset() must be implemented');
        }

        /**
         * Get current state as string
         * @returns {string} Current state value
         */
        getState() {
            throw new Error('Method getState() must be implemented');
        }

        /**
         * Get PRNG name
         * @returns {string} PRNG name
         */
        getName() {
            throw new Error('Method getName() must be implemented');
        }
    }

    // ============================================
    // LCG PRNG implementation with BigInt
    // ============================================

    /**
     * Linear Congruential Generator using BigInt for true 64-bit arithmetic
     * Implements PRNG interface
     */
    class LCG extends PRNG {
        /**
         * @param {bigint|number} [seed=42n] - Initial seed value
         */
        constructor(seed = 42n) {
            super();
            this.state = BigInt(seed);
            this.a = LCG_PARAMS.A;
            this.c = LCG_PARAMS.C;
            this.m = LCG_PARAMS.M;
            this.defaultSeed = 42n;
        }

        /**
         * Generate next random number in [0, 1)
         * @returns {number} Random value between 0 (inclusive) and 1 (exclusive)
         */
        next() {
            this.state = (this.a * this.state + this.c) % this.m;
            // Convert BigInt to number in [0, 1) range
            return Number(this.state) / Number(this.m);
        }

        /**
         * Reset the PRNG state
         * @param {bigint|number} [seed] - New seed value (defaults to 42n)
         */
        reset(seed) {
            this.state = seed !== undefined ? BigInt(seed) : this.defaultSeed;
        }

        /**
         * Get current state as string
         * @returns {string} Current state value
         */
        getState() {
            return this.state.toString();
        }

        /**
         * Get PRNG name
         * @returns {string} PRNG name
         */
        getName() {
            return 'LCG';
        }
    }

    // ============================================
    // LFSR PRNG implementation
    // ============================================

    /**
     * Linear Feedback Shift Register - General purpose PRNG
     * Feedback polynomial: x^8 + x^4 + x^3 + x^2 + 1
     * Implements PRNG interface
     */
    class LFSR extends PRNG {
        /**
         * @param {number} [seed=0x81] - Initial seed value (8-bit)
         */
        constructor(seed = LFSR_PARAMS.DEFAULT_SEED) {
            super();
            this.state = seed || LFSR_PARAMS.DEFAULT_SEED;
            this.defaultSeed = LFSR_PARAMS.DEFAULT_SEED;
        }

        /**
         * Generate next LFSR bit
         * @returns {number} Next bit (0 or 1)
         */
        nextBit() {
            const feedback = ((this.state >> 0) ^ (this.state >> 2) ^ 
                            (this.state >> 3) ^ (this.state >> 4)) & 1;
            this.state = ((this.state >> 1) | (feedback << 7)) & 0xFF;
            return feedback;
        }

        /**
         * Generate next random number in [0, 1)
         * @returns {number} Random value between 0 (inclusive) and 1 (exclusive)
         */
        next() {
            this.nextBit();
            // Return state as a number in [0, 1) range
            return this.state / 256.0;
        }

        /**
         * Generate next random integer in [0, max)
         * @param {number} max - Upper bound (exclusive)
         * @returns {number} Random integer in [0, max)
         */
        nextInt(max) {
            this.nextBit();
            return Math.floor((this.state / 256.0) * max);
        }

        /**
         * Reset LFSR state
         * @param {number} [seed] - New seed value (defaults to 0x81)
         */
        reset(seed) {
            this.state = seed !== undefined ? seed : this.defaultSeed;
        }

        /**
         * Get current state as string
         * @returns {string} Current state value
         */
        getState() {
            return this.state.toString(16).padStart(2, '0');
        }

        /**
         * Get PRNG name
         * @returns {string} PRNG name
         */
        getName() {
            return 'LFSR';
        }
    }

    // ============================================
    // Perlin Noise implementation (1D)
    // ============================================

    /**
     * Compute LCM of an array of numbers
     * @param {number[]} numbers - Array of positive integers
     * @returns {number} LCM of all numbers
     */
    function computeLCM(numbers) {
        if (numbers.length === 0) return 1;
        
        /**
         * Compute GCD using Euclidean algorithm
         */
        const gcd = (a, b) => {
            while (b !== 0) {
                const temp = b;
                b = a % b;
                a = temp;
            }
            return a;
        };
        
        const lcm = (a, b) => (a * b) / gcd(a, b);
        
        let result = numbers[0];
        for (let i = 1; i < numbers.length; i++) {
            result = lcm(result, numbers[i]);
        }
        return result;
    }

    /**
     * Perlin Noise generator for natural-looking patterns
     * 1D implementation with chunking support
     */
    class PerlinNoise {
        /**
         * @param {bigint|number} [seed=0] - Seed for random number generator
         * @param {number} [sampleFrequency=60] - Base sample frequency in Hz
         */
        constructor(seed = 0, sampleFrequency = 60) {
            this.seed = seed;
            this.sampleFrequency = sampleFrequency;
            this.frequencies = [1]; // Start with base frequency
            this.array = null;
            this.base = 0;
            this.arraySize = 0;
            this.prng = null;
            this._initialize();
        }

        /**
         * Initialize or reinitialize the noise generator
         */
        _initialize() {
            this.prng = new LCG(this.seed);
            this._recreateArray();
        }

        /**
         * Compute the LCM of all registered frequencies
         * @returns {number} LCM of frequencies
         */
        _computeFrequencyLCM() {
            return computeLCM(this.frequencies);
        }

        /**
         * Recreate the noise array based on current frequencies and base
         */
        _recreateArray() {
            const lcm = this._computeFrequencyLCM();
            this.arraySize = lcm * this.sampleFrequency;
            
            // Create array covering [base, base + arraySize)
            this.array = new Float64Array(this.arraySize);
            
            // Fill the array with combined noise from all frequencies
            for (let i = 0; i < this.arraySize; i++) {
                const x = this.base + i;
                let value = 0;
                
                // Sum contributions from all frequencies
                for (const freq of this.frequencies) {
                    // Scale coordinate by frequency
                    const scaledX = x * freq;
                    // Get the 1D vector value at this grid point
                    const gridValue = this._getVectorValue(scaledX);
                    value += gridValue;
                }
                
                this.array[i] = value;
            }
        }

        /**
         * Get the 1D vector value at a grid coordinate
         * Vectors are in [-255, 255] and point left (negative) or right (positive)
         * @param {number} x - Grid coordinate
         * @returns {number} Vector value in [-255, 255]
         */
        _getVectorValue(x) {
            // Use PRNG to generate a random value in [-255, 255]
            const randomValue = this.prng.next();
            // Map [0, 1) to [-255, 255]
            return Math.floor(randomValue * 511) - 255;
        }

        /**
         * Fade function for smooth interpolation (5th degree polynomial)
         * @param {number} t - Input value in [0, 1]
         * @returns {number} Faded value
         */
        fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        /**
         * Linear interpolation
         * @param {number} t - Interpolation factor in [0, 1]
         * @param {number} a - Start value
         * @param {number} b - End value
         * @returns {number} Interpolated value
         */
        lerp(t, a, b) {
            return a + t * (b - a);
        }

        /**
         * 1D Perlin noise
         * @param {number} x - X coordinate
         * @returns {number} Noise value
         */
        noise1(x) {
            // Check if we need to recreate the array
            const lcm = this._computeFrequencyLCM();
            const requiredSize = lcm * this.sampleFrequency;
            
            // Calculate which chunk x belongs to
            const chunkStart = Math.floor(x / requiredSize) * requiredSize;
            
            if (chunkStart !== this.base) {
                // Need to recreate array for this chunk
                this.base = chunkStart;
                this._recreateArray();
            }

            // Calculate position within the current array
            const localX = x - this.base;
            
            // Clamp to array bounds (shouldn't happen with proper chunking)
            if (localX < 0 || localX >= this.arraySize) {
                // Fallback: recreate with proper base
                this.base = Math.floor(x / requiredSize) * requiredSize;
                this._recreateArray();
                return 0; // Should be handled by recreation above
            }

            // Get integer coordinates
            const xi = Math.floor(localX);
            const x0 = xi;
            const x1 = xi + 1;

            // Handle edge case at the end of the array
            if (x1 >= this.arraySize) {
                // Wrap or return edge value
                return this.array[x0];
            }

            // Compute fractional part
            const sx = localX - xi;
            const u = this.fade(sx);

            // Get values from array
            const v0 = this.array[x0];
            const v1 = this.array[x1];

            // Linear interpolation with fade
            return this.lerp(u, v0, v1);
        }

        /**
         * Add a noise frequency
         * @param {number} frequency - Frequency to add (must be positive integer)
         */
        addFrequency(frequency) {
            if (frequency <= 0 || !Number.isInteger(frequency)) {
                console.warn(`Invalid frequency: ${frequency}. Must be positive integer.`);
                return;
            }
            
            if (!this.frequencies.includes(frequency)) {
                this.frequencies.push(frequency);
                // Recreate array with new frequencies
                this._recreateArray();
            }
        }

        /**
         * Get the sample frequency
         * @returns {number} Current sample frequency in Hz
         */
        getSampleFrequency() {
            return this.sampleFrequency;
        }

        /**
         * Set the sample frequency
         * @param {number} frequency - New sample frequency in Hz
         */
        setSampleFrequency(frequency) {
            if (frequency <= 0) {
                console.warn(`Invalid sample frequency: ${frequency}. Must be positive.`);
                return;
            }
            this.sampleFrequency = frequency;
            this._recreateArray();
        }

        /**
         * Get current frequencies
         * @returns {number[]} Array of registered frequencies
         */
        getFrequencies() {
            return [...this.frequencies];
        }

        /**
         * Reset with new seed
         * @param {bigint|number} [seed=0] - New seed value
         */
        reset(seed = 0) {
            this.seed = seed;
            this._initialize();
        }

        /**
         * Get current seed as string
         * @returns {string} Current seed value
         */
        getState() {
            return BigInt(this.seed).toString();
        }

        /**
         * Get the current array bounds
         * @returns {Object} Object with base and size properties
         */
        getArrayBounds() {
            return {
                base: this.base,
                size: this.arraySize
            };
        }

        /**
         * 2D Perlin noise (legacy - kept for backward compatibility)
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @returns {number} Noise value in [-1, 1]
         */
        noise2(x, y) {
            // Fallback implementation for backward compatibility
            // Uses simple hash-based noise
            const X = Math.floor(x) & 255;
            const Y = Math.floor(y) & 255;

            x -= Math.floor(x);
            y -= Math.floor(y);

            const u = this.fade(x);
            const v = this.fade(y);

            // Simple hash function for 2D
            const hash = (x, y) => {
                let h = (x * 378559 + y * 994911) % 256;
                return h;
            };

            const A = hash(X, Y);
            const B = hash(X + 1, Y);

            return this.lerp(
                v,
                this.lerp(u, A / 255 * 2 - 1, B / 255 * 2 - 1),
                this.lerp(u, (hash(X, Y + 1) / 255 * 2 - 1), (hash(X + 1, Y + 1) / 255 * 2 - 1))
            );
        }

        /**
         * Fractional Brownian Motion (legacy - kept for backward compatibility)
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @param {number} [octaves=4] - Number of octaves
         * @param {number} [persistence=0.5] - Persistence value
         * @param {number} [lacunarity=2.0] - Lacunarity value
         * @returns {number} fBm noise value in [-1, 1]
         */
        fBm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
            let total = 0;
            let frequency = 1;
            let amplitude = 1;
            let maxValue = 0;

            for (let i = 0; i < octaves; i++) {
                total += this.noise2(x * frequency, y * frequency) * amplitude;
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }

            return total / maxValue;
        }
    }

    /**
     * Perlin Noise PRNG Wrapper - models Perlin noise as a PRNG
     * Implements PRNG interface
     */
    class PerlinNoisePRNG extends PRNG {
        /**
         * @param {bigint|number} [seed=0] - Initial seed value
         */
        constructor(seed = 0) {
            super();
            this.perlin = new PerlinNoise(seed);
            this.counter = 0;
            this.defaultSeed = 0;
        }

        /**
         * Generate next random number in [0, 1)
         * Uses 1D Perlin noise at increasing x coordinates
         * @returns {number} Random value between 0 (inclusive) and 1 (exclusive)
         */
        next() {
            // Use 1D noise to get a value and map from range to [0,1)
            const noise = this.perlin.noise1(this.counter);
            this.counter++;
            // Normalize from the expected range to [0,1)
            // The noise values can be in a wide range due to multiple frequencies
            // We'll use a simple normalization based on max possible value
            const maxPossible = this.perlin.frequencies.length * 255;
            return (noise / maxPossible + 0.5);
        }

        /**
         * Reset the PRNG state
         * @param {bigint|number} [seed] - New seed value
         */
        reset(seed) {
            this.perlin.reset(seed !== undefined ? seed : this.defaultSeed);
            this.counter = 0;
        }

        /**
         * Get current state as string
         * @returns {string} Current state value
         */
        getState() {
            return `${this.perlin.getState()}_${this.counter}`;
        }

        /**
         * Get PRNG name
         * @returns {string} PRNG name
         */
        getName() {
            return 'Perlin';
        }
    }

    // ============================================
    // Damped Harmonic Oscillator class for candle flicker
    // ============================================

    /**
     * Damped Harmonic Oscillator simulating physical candle flicker
     * Models buoyancy-driven Kelvin-Helmholtz instability
     */
    class DampedHarmonicOscillator {
        /**
         * @param {number} [seed=42] - Seed for internal PRNG
         */
        constructor(seed = 42) {
            this.position = 0.0;
            this.velocity = 0.0;
            this.frequency = OSCILLATOR_PARAMS.FREQUENCY;
            this.damping = OSCILLATOR_PARAMS.DAMPING;
            this.seed = seed;
            this.deltaTime = OSCILLATOR_PARAMS.DELTA_TIME;
        }

        /**
         * Set the PRNG to use
         * @param {PRNG} prng - PRNG instance
         */
        setPRNG(prng) {
            this.prng = prng;
        }

        /**
         * Generate next oscillator value
         * @returns {number} Intensity value in [0.6, 1.0]
         */
        next() {
            if (!this.prng) {
                this.prng = new LCG(this.seed);
            }

            // Add random disturbance occasionally (simulates air currents)
            if (this.prng.next() < OSCILLATOR_PARAMS.DISTURBANCE_CHANCE) {
                this.velocity += (this.prng.next() * 2 - 1) * OSCILLATOR_PARAMS.KICK_MAGNITUDE;
            }

            // Update oscillator using simple harmonic motion with damping
            const acceleration = -this.frequency * this.frequency * this.position - 
                                this.damping * this.velocity;
            this.velocity += acceleration * this.deltaTime;
            this.position += this.velocity * this.deltaTime;

            // Apply damping to velocity (exponential decay)
            this.velocity *= this.damping;

            // Map position to intensity range [0.6, 1.0]
            const normalized = (this.position + 1.0) / 2.0; // Map [-1,1] to [0,1]
            const intensity = 0.8 + normalized * 0.2; // [0.8, 1.0]

            return Math.min(Math.max(intensity, CANDLE_PARAMS.MIN_INTENSITY), 
                           CANDLE_PARAMS.MAX_INTENSITY);
        }

        /**
         * Reset oscillator state
         * @param {number} [seed=42] - New seed value
         */
        reset(seed = 42) {
            this.position = 0.0;
            this.velocity = 0.0;
            this.seed = seed;
            delete this.prng;
        }
    }

    // ============================================
    // Constrained Random Walk class for candle flicker
    // ============================================

    /**
     * Constrained Random Walk with occasional larger flickers
     * Simple but produces natural slow variations
     */
    class ConstrainedRandomWalk {
        /**
         * @param {number} [seed=42] - Seed for internal PRNG
         */
        constructor(seed = 42) {
            this.brightness = RANDOM_WALK_PARAMS.START_BRIGHTNESS;
            this.minBrightness = RANDOM_WALK_PARAMS.MIN_BRIGHTNESS;
            this.maxBrightness = RANDOM_WALK_PARAMS.MAX_BRIGHTNESS;
            this.seed = seed;
        }

        /**
         * Set the PRNG to use
         * @param {PRNG} prng - PRNG instance
         */
        setPRNG(prng) {
            this.prng = prng;
        }

        /**
         * Generate next brightness value
         * @returns {number} Intensity value in [0.59, 0.94]
         */
        next() {
            if (!this.prng) {
                this.prng = new LCG(this.seed);
            }

            // Random step: small changes most of the time
            const step = this.prng.nextInt(RANDOM_WALK_PARAMS.SMALL_STEP_RANGE) - 
                        (RANDOM_WALK_PARAMS.SMALL_STEP_RANGE - 1) / 2;
            this.brightness += step;

            // Constrain to bounds
            this.brightness = Math.max(this.minBrightness, 
                                       Math.min(this.maxBrightness, this.brightness));

            // Add occasional larger flicker
            if (this.prng.next() < RANDOM_WALK_PARAMS.LARGE_STEP_CHANCE) {
                const largeStep = this.prng.nextInt(RANDOM_WALK_PARAMS.LARGE_STEP_RANGE) - 
                                 (RANDOM_WALK_PARAMS.LARGE_STEP_RANGE - 1) / 2;
                this.brightness += largeStep;
                this.brightness = Math.max(this.minBrightness, 
                                           Math.min(this.maxBrightness, this.brightness));
            }

            // Map to intensity range [0.59, 0.94]
            return this.brightness / 255.0;
        }

        /**
         * Reset random walk state
         * @param {number} [seed=42] - New seed value
         */
        reset(seed = 42) {
            this.brightness = RANDOM_WALK_PARAMS.START_BRIGHTNESS;
            this.seed = seed;
            delete this.prng;
        }
    }

    // ============================================
    // Timer at 60Hz with drift correction
    // ============================================

    /**
     * Timer class for consistent 60Hz updates
     */
    class Timer {
        /**
         * @param {number} [fps=60] - Target frames per second
         */
        constructor(fps = TIMER_PARAMS.FPS) {
            this.fps = fps;
            this.interval = TIMER_PARAMS.FRAME_INTERVAL;
            this.frame = 0;
            this.lastTime = 0;
            this.callback = null;
            this.animationFrameId = null;
            this.isRunning = false;
        }

        /**
         * Start the timer
         * @param {Function} callback - Function to call on each frame
         */
        start(callback) {
            this.callback = callback;
            this.isRunning = true;
            this.lastTime = performance.now();
            this._tick();
        }

        /**
         * Internal tick function
         */
        _tick() {
            if (!this.isRunning) return;

            const now = performance.now();
            const elapsed = now - this.lastTime;

            if (elapsed >= this.interval) {
                this.frame++;
                if (this.callback) {
                    this.callback(this.frame);
                }
                this.lastTime = now - (elapsed % this.interval);
            }

            this.animationFrameId = requestAnimationFrame(() => this._tick());
        }

        /**
         * Stop the timer
         */
        stop() {
            this.isRunning = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }

    // ============================================
    // Utility Functions
    // ============================================

    /**
     * Convert HSV to RGB
     * @param {number} h - Hue [0, 1]
     * @param {number} s - Saturation [0, 1]
     * @param {number} v - Value [0, 1]
     * @returns {Object} RGB object with r, g, b in [0, 255]
     */
    function hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
            default: r = g = b = 0;
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    /**
     * Convert RGB to HSV
     * @param {number} r - Red [0, 255]
     * @param {number} g - Green [0, 255]
     * @param {number} b - Blue [0, 255]
     * @returns {Object} HSV object with h [0, 360], s [0, 100], v [0, 100]
     */
    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h, s = (max === 0 ? 0 : d / max);
        const v = max;

        switch (max) {
            case min: h = 0; break;
            case r: h = (g - b) + d * (g < b ? 6 : 0); h /= d; break;
            case g: h = (b - r) + d * 2; h /= d; break;
            case b: h = (r - g) + d * 4; h /= d; break;
        }

        h = Math.round(h * 60);
        if (h < 0) h += 360;

        return {
            h: h,
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }

    /**
     * Modulate candle color based on intensity
     * Uses 1800K-2000K color temperature range
     * @param {number} intensity - Intensity value [0, 1]
     * @returns {Object} RGB object with r, g, b in [0, 255]
     */
    function modulateCandleColor(intensity) {
        // Base color at full intensity (1800K candle color)
        const baseR = 255;
        const baseG = 147;
        const baseB = 41;

        // At lower intensity, shift toward deeper red/orange
        const minR = 255;
        const minG = 80;
        const minB = 0;

        // Interpolate based on intensity
        const r = Math.round(minR + (baseR - minR) * intensity);
        const g = Math.round(minG + (baseG - minG) * intensity);
        const b = Math.round(minB + (baseB - minB) * intensity);

        return { r, g, b };
    }

    // ============================================
    // PRNG Factory
    // ============================================

    /**
     * PRNG types available
     */
    const PRNG_TYPES = {
        lcg: { name: 'LCG', class: LCG, defaultSeed: 42n },
        lfsr: { name: 'LFSR', class: LFSR, defaultSeed: 0x81 },
        perlin: { name: 'Perlin', class: PerlinNoisePRNG, defaultSeed: 0 }
    };

    /**
     * Create a PRNG instance based on type
     * @param {string} type - PRNG type ('lcg', 'lfsr', 'perlin')
     * @param {bigint|number} [seed] - Optional seed value
     * @returns {PRNG} PRNG instance
     */
    function createPRNG(type, seed) {
        const prngConfig = PRNG_TYPES[type];
        if (!prngConfig) {
            console.warn(`Unknown PRNG type: ${type}, falling back to LCG`);
            return new LCG(seed);
        }
        
        if (seed !== undefined) {
            return new prngConfig.class(seed);
        } else {
            return new prngConfig.class(prngConfig.defaultSeed);
        }
    }

    // ============================================
    // Blink Patterns
    // ============================================

    // Shared state for patterns that need persistent PRNG-based objects
    const patternState = {
        oscillator: null,
        randomWalk: null,
        lfsrFlicker: 180
    };

    /**
     * Pattern definitions
     * Each pattern has: name, usesPerlin (or usesPRNG), execute function
     */
    const patterns = {
        rgbSweep: {
            name: 'RGB Color Sweep',
            usesPerlin: false,
            /**
             * Goes around color circle with constant intensity
             * @param {number} timerFrame - Current frame number
             * @param {PRNG} prng - PRNG instance (state is advanced)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Advance PRNG state
                prng.next();

                // Hue cycles from 0 to 360 degrees over time
                const hue = (timerFrame * speed * 0.5) % 360;
                const saturation = 100;
                const value = 100;

                // Convert HSV to RGB
                const rgb = hsvToRgb(hue / 360, saturation / 100, value / 100);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: value / 100
                };
            }
        },
        candle: {
            name: 'Candle Flicker',
            usesPerlin: true,
            /**
             * Perlin noise based candle with 1800K-2000K color temperature
             * @param {number} timerFrame - Current frame number
             * @param {PerlinNoise} perlin - Perlin noise instance
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, perlin, speed) {
                const time = timerFrame * speed * TIMER_PARAMS.TIME_SCALE;

                // Use 1D noise for flicker
                const flickerNoise = perlin.noise1(time);

                // Normalize noise value to [-1, 1] range
                const maxPossible = perlin.getFrequencies().length * 255;
                const normalizedNoise = (flickerNoise / maxPossible) * 2;

                // Map noise range [-1,1] to intensity range [0.6, 1.0]
                const intensity = CANDLE_PARAMS.BASE_INTENSITY + normalizedNoise * CANDLE_PARAMS.FLICKER_RANGE;

                // Get RGB based on intensity
                const rgb = modulateCandleColor(intensity);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: intensity
                };
            }
        },
        perlinCandle: {
            name: 'Perlin Candle',
            usesPerlin: true,
            /**
             * Advanced perlin noise candle with 1800K-2000K color temperature
             * @param {number} timerFrame - Current frame number
             * @param {PerlinNoise} perlin - Perlin noise instance
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, perlin, speed) {
                const time = timerFrame * speed * TIMER_PARAMS.TIME_SCALE;

                // Primary flicker - fast, small variations
                // We'll use different perlin instances for different frequencies
                const flicker1 = perlin.noise1(time * 2);
                const flicker2 = perlin.noise1(time * 0.5);

                // Normalize noise values
                const maxPossible = perlin.getFrequencies().length * 255;
                const normalizedFlicker1 = (flicker1 / maxPossible) * 2;
                const normalizedFlicker2 = (flicker2 / maxPossible) * 2;

                // Combine flickers for more natural effect
                let intensity = 0.7 + (normalizedFlicker1 * 0.15 + normalizedFlicker2 * 0.1) + 0.15;
                intensity = Math.min(intensity, CANDLE_PARAMS.MAX_INTENSITY);

                // Get RGB using candle color modulation
                const rgb = modulateCandleColor(intensity);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: intensity
                };
            }
        },
        lfsrCandle: {
            name: 'LFSR Candle',
            usesPerlin: false,
            /**
             * Uses the selected PRNG with shaping filter
             * @param {number} timerFrame - Current frame number
             * @param {PRNG} prng - PRNG instance (state is advanced)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Use PRNG to get a random value
                let intensityValue = prng.next();
                
                // Apply low-pass filter for smoother flicker
                // Simulate filter by averaging with previous value
                const filterAlpha = LFSR_PARAMS.FILTER_ALPHA;
                patternState.lfsrFlicker = Math.round(filterAlpha * (intensityValue * 255) + 
                                                     (1 - filterAlpha) * patternState.lfsrFlicker);
                
                // Run for additional cycles based on speed
                for (let i = 1; i < Math.max(1, Math.floor(speed * 4)); i++) {
                    intensityValue = prng.next();
                    patternState.lfsrFlicker = Math.round(filterAlpha * (intensityValue * 255) + 
                                                         (1 - filterAlpha) * patternState.lfsrFlicker);
                }

                // Map to intensity range [0.6, 1.0]
                const intensity = (patternState.lfsrFlicker / 255.0) * 0.4 + LFSR_PARAMS.MIN_BRIGHTNESS;

                // Get RGB using candle color modulation
                const rgb = modulateCandleColor(intensity);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: intensity
                };
            }
        },
        oscillatorCandle: {
            name: 'Oscillator Candle',
            usesPerlin: false,
            /**
             * Damped harmonic oscillator simulating physical candle flicker
             * Models buoyancy-driven Kelvin-Helmholtz instability
             * @param {number} timerFrame - Current frame number
             * @param {PRNG} prng - PRNG instance (state is advanced)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Initialize oscillator with PRNG on first run
                if (!patternState.oscillator) {
                    patternState.oscillator = new DampedHarmonicOscillator();
                }
                patternState.oscillator.setPRNG(prng);

                // Run oscillator for cycles based on speed
                let intensity = CANDLE_PARAMS.BASE_INTENSITY;
                for (let i = 0; i < Math.max(1, Math.floor(speed * 2)); i++) {
                    intensity = patternState.oscillator.next();
                }

                // Get RGB using candle color modulation
                const rgb = modulateCandleColor(intensity);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: intensity
                };
            }
        },
        randomWalkCandle: {
            name: 'Random Walk Candle',
            usesPerlin: false,
            /**
             * Constrained random walk with occasional larger flickers
             * Simple but produces natural slow variations, centered at 75%
             * @param {number} timerFrame - Current frame number
             * @param {PRNG} prng - PRNG instance (state is advanced)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Initialize random walk with PRNG on first run
                if (!patternState.randomWalk) {
                    patternState.randomWalk = new ConstrainedRandomWalk();
                }
                patternState.randomWalk.setPRNG(prng);

                // Run random walk for cycles based on speed
                let intensity = CANDLE_PARAMS.CENTER_INTENSITY;
                for (let i = 0; i < Math.max(1, Math.floor(speed * 3)); i++) {
                    intensity = patternState.randomWalk.next();
                }

                // Get RGB using candle color modulation
                const rgb = modulateCandleColor(intensity);

                return {
                    r: rgb.r,
                    g: rgb.g,
                    b: rgb.b,
                    intensity: intensity
                };
            }
        }
    };

    // ============================================
    // Main Application
    // ============================================

    /**
     * Main application function
     */
    function main() {
        try {
            // Elements
            const patternSelect = document.getElementById('pattern');
            const prngSelect = document.getElementById('prng');
            const speedSelect = document.getElementById('speed');
            const resetBtn = document.getElementById('reset');
            const colorDisplay = document.getElementById('colorDisplay');
            const intensityDisplay = document.getElementById('intensityDisplay');

            // Info elements
            const infoPattern = document.getElementById('infoPattern');
            const infoPrngType = document.getElementById('infoPrngType');
            const infoTimer = document.getElementById('infoTimer');
            const infoPrng = document.getElementById('infoPrng');
            const infoRgb = document.getElementById('infoRgb');
            const infoIntensity = document.getElementById('infoIntensity');
            const infoHsv = document.getElementById('infoHsv');

            // Validate DOM elements exist
            const requiredElements = [
                patternSelect, prngSelect, speedSelect, resetBtn, colorDisplay, intensityDisplay,
                infoPattern, infoPrngType, infoTimer, infoPrng, infoRgb, infoIntensity, infoHsv
            ];

            for (const el of requiredElements) {
                if (!el) {
                    throw new Error(`Required DOM element not found: ${el ? el.id : 'unknown'}`);
                }
            }

            // Initialize PRNG and Timer
            let currentPrngType = prngSelect.value;
            let prng = createPRNG(currentPrngType);
            const timer = new Timer(60);

            // Cache PerlinNoise instances for patterns that need them
            const perlinInstances = {};
            for (const patternName in patterns) {
                if (patterns[patternName].usesPerlin) {
                    // Create PerlinNoise instance with sample frequency matching timer
                    perlinInstances[patternName] = new PerlinNoise(0, 60);
                    // Add some frequencies for richer noise
                    perlinInstances[patternName].addFrequency(2);
                    perlinInstances[patternName].addFrequency(3);
                }
            }

            // Initialize from combo box values
            let currentPattern = patternSelect.value;
            let speed = parseFloat(speedSelect.value);

            // Validate that the saved pattern value is valid, otherwise reset to default
            if (!patterns[currentPattern]) {
                currentPattern = 'rgbSweep';
                patternSelect.value = 'rgbSweep';
            }

            // Validate speed is a valid number
            if (isNaN(speed) || speed <= 0) {
                speed = 1;
                speedSelect.value = '1';
            }

            // Store previous PRNG state for random seed generation
            let previousPrngState = null;

            /**
             * Update UI with current state
             * @param {Object} result - Pattern result with r, g, b, intensity
             * @param {number} frame - Current frame number
             */
            function updateUI(result, frame) {
                try {
                    // Update color display
                    colorDisplay.style.backgroundColor = `rgb(${result.r}, ${result.g}, ${result.b})`;

                    // Update intensity display
                    const intensityPercent = result.intensity * 100;
                    intensityDisplay.style.backgroundColor = `rgba(255, 255, 255, ${result.intensity})`;
                    intensityDisplay.style.boxShadow = `0 0 20px rgba(255, 255, 255, ${result.intensity})`;

                    // Update info with fixed-width formatting
                    infoTimer.textContent = frame.toString().padStart(6, ' ');
                    infoPrng.textContent = prng.getState().padStart(20, '0');
                    infoPattern.textContent = patterns[currentPattern].name;
                    infoPrngType.textContent = prng.getName();
                    infoRgb.textContent = `(${result.r.toString().padStart(3, ' ')}, ${result.g.toString().padStart(3, ' ')}, ${result.b.toString().padStart(3, ' ')})`;
                    infoIntensity.textContent = `${Math.round(intensityPercent).toString().padStart(3, ' ')}%`;

                    const hsv = rgbToHsv(result.r, result.g, result.b);
                    infoHsv.textContent = `(${hsv.h.toString().padStart(3, ' ')}\u00b0, ${hsv.s.toString().padStart(3, ' ')}%, ${hsv.v.toString().padStart(3, ' ')}%)`;
                } catch (error) {
                    console.error('Error updating UI:', error);
                }
            }

            /**
             * Timer callback - called at 60Hz
             * @param {number} frame - Current frame number
             */
            function onTimer(frame) {
                try {
                    speed = parseFloat(speedSelect.value);

                    // Validate speed
                    if (isNaN(speed) || speed <= 0) {
                        speed = 1;
                    }

                    let result;
                    if (patterns[currentPattern].usesPerlin) {
                        // Use cached PerlinNoise instance
                        result = patterns[currentPattern].execute(frame, perlinInstances[currentPattern], speed);
                    } else {
                        // Pass PRNG for non-Perlin patterns - state will be advanced by pattern
                        result = patterns[currentPattern].execute(frame, prng, speed);
                    }

                    updateUI(result, frame);
                } catch (error) {
                    console.error('Error in timer callback:', error);
                }
            }

            /**
             * Handle pattern change
             * @param {string} patternName - New pattern name
             */
            function changePattern(patternName) {
                if (patterns[patternName]) {
                    currentPattern = patternName;
                    // Reset PRNG state when pattern changes to ensure consistent behavior
                    prng.reset();
                    // Reset pattern state
                    patternState.oscillator = null;
                    patternState.randomWalk = null;
                    patternState.lfsrFlicker = 180;
                    // Update the PerlinNoise instance for the new pattern if it uses Perlin
                    if (patterns[currentPattern].usesPerlin) {
                        perlinInstances[currentPattern] = new PerlinNoise();
                    }
                } else {
                    console.warn(`Unknown pattern: ${patternName}, falling back to rgbSweep`);
                    currentPattern = 'rgbSweep';
                    patternSelect.value = 'rgbSweep';
                    prng.reset();
                    patternState.oscillator = null;
                    patternState.randomWalk = null;
                    patternState.lfsrFlicker = 180;
                }
            }

            /**
             * Handle PRNG change
             * @param {string} prngType - New PRNG type
             */
            function changePRNG(prngType) {
                if (PRNG_TYPES[prngType]) {
                    // Store current state for potential use in seeding
                    previousPrngState = prng.getState();
                    
                    // Create new PRNG with a random seed based on previous state if available
                    // This ensures different sequences when switching
                    let newSeed;
                    if (previousPrngState) {
                        // Use a hash of the previous state as seed for deterministic but different sequences
                        let hash = 0;
                        for (let i = 0; i < previousPrngState.length; i++) {
                            const char = previousPrngState.charCodeAt(i);
                            hash = ((hash << 5) - hash) + char;
                            hash = hash & hash; // Convert to 32-bit integer
                        }
                        newSeed = hash !== 0 ? BigInt(hash) : undefined;
                    }
                    
                    currentPrngType = prngType;
                    prng = createPRNG(prngType, newSeed);
                    
                    // Reset pattern state since PRNG changed
                    patternState.oscillator = null;
                    patternState.randomWalk = null;
                    patternState.lfsrFlicker = 180;
                } else {
                    console.warn(`Unknown PRNG type: ${prngType}, falling back to LCG`);
                    currentPrngType = 'lcg';
                    prng = createPRNG('lcg');
                    prngSelect.value = 'lcg';
                    patternState.oscillator = null;
                    patternState.randomWalk = null;
                    patternState.lfsrFlicker = 180;
                }
            }

            // Event listeners
            patternSelect.addEventListener('change', (e) => {
                changePattern(e.target.value);
            });

            prngSelect.addEventListener('change', (e) => {
                changePRNG(e.target.value);
            });

            speedSelect.addEventListener('change', (e) => {
                const newSpeed = parseFloat(e.target.value);
                if (!isNaN(newSpeed) && newSpeed > 0) {
                    speed = newSpeed;
                } else {
                    speed = 1;
                    speedSelect.value = '1';
                }
            });

            resetBtn.addEventListener('click', () => {
                prng.reset();
                // Reset pattern state
                patternState.oscillator = null;
                patternState.randomWalk = null;
                patternState.lfsrFlicker = 180;
                // Also reset PerlinNoise instances
                for (const key in perlinInstances) {
                    perlinInstances[key] = new PerlinNoise();
                }
            });

            // Cleanup on page unload
            window.addEventListener('beforeunload', () => {
                timer.stop();
            });

            // Start the timer
            timer.start(onTimer);

        } catch (error) {
            console.error('Error initializing application:', error);
            // Display error to user
            const errorElement = document.createElement('div');
            errorElement.style.cssText = 'color: #ff0000; padding: 20px; font-family: monospace; white-space: pre-wrap; background: #16213e; border-radius: 10px; margin: 20px;';
            errorElement.textContent = `Error: ${error.message}`;
            document.body.prepend(errorElement);
        }
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }
})();
