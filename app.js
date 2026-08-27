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
    // LCG PRNG implementation with BigInt
    // ============================================

    /**
     * Linear Congruential Generator using BigInt for true 64-bit arithmetic
     */
    class LCG {
        /**
         * @param {bigint|number} [seed=42n] - Initial seed value
         */
        constructor(seed = 42n) {
            this.state = BigInt(seed);
            this.a = LCG_PARAMS.A;
            this.c = LCG_PARAMS.C;
            this.m = LCG_PARAMS.M;
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
         * Generate next random integer in [0, max)
         * @param {number} max - Upper bound (exclusive)
         * @returns {number} Random integer in [0, max)
         */
        nextInt(max) {
            return Math.floor(this.next() * max);
        }

        /**
         * Reset the PRNG state
         * @param {bigint|number} [seed=42n] - New seed value
         */
        reset(seed = 42n) {
            this.state = BigInt(seed);
        }

        /**
         * Get current state as string
         * @returns {string} Current state value
         */
        getState() {
            return this.state.toString();
        }
    }

    // ============================================
    // LFSR with Shaping class for candle flicker
    // ============================================

    /**
     * Linear Feedback Shift Register with shaping filter
     * Extremely low computational cost
     */
    class LFSR {
        /**
         * @param {number} [seed=0x81] - Initial seed value
         */
        constructor(seed = LFSR_PARAMS.DEFAULT_SEED) {
            this.state = seed || LFSR_PARAMS.DEFAULT_SEED;
            this.flicker = 180; // Current flicker value (0-255)
            this.filterAlpha = LFSR_PARAMS.FILTER_ALPHA;
        }

        /**
         * Generate next LFSR bit
         * Feedback polynomial: x^8 + x^4 + x^3 + x^2 + 1
         * @returns {number} Next bit (0 or 1)
         */
        nextBit() {
            const feedback = ((this.state >> 0) ^ (this.state >> 2) ^ 
                            (this.state >> 3) ^ (this.state >> 4)) & 1;
            this.state = ((this.state >> 1) | (feedback << 7)) & 0xFF;
            return feedback;
        }

        /**
         * Generate next flicker value
         * @returns {number} Flicker value (0-255)
         */
        next() {
            this.nextBit();
            const raw = this.state;
            // Apply low-pass filter
            this.flicker = Math.round(this.filterAlpha * raw + 
                                     (1 - this.filterAlpha) * this.flicker);
            return this.flicker;
        }

        /**
         * Reset LFSR state
         * @param {number} [seed=0x81] - New seed value
         */
        reset(seed = LFSR_PARAMS.DEFAULT_SEED) {
            this.state = seed || LFSR_PARAMS.DEFAULT_SEED;
            this.flicker = 180;
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
            this.prng = new LCG(seed);
            this.deltaTime = OSCILLATOR_PARAMS.DELTA_TIME;
        }

        /**
         * Generate next oscillator value
         * @returns {number} Intensity value in [0.6, 1.0]
         */
        next() {
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
            this.prng.reset(seed);
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
            this.prng = new LCG(seed);
        }

        /**
         * Generate next brightness value
         * @returns {number} Intensity value in [0.59, 0.94]
         */
        next() {
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
            this.prng.reset(seed);
        }
    }

    // ============================================
    // Perlin Noise implementation for natural candle flicker
    // ============================================

    /**
     * Perlin Noise generator for natural-looking patterns
     */
    class PerlinNoise {
        /**
         * @param {bigint|number} [seed=0] - Seed for permutation table
         */
        constructor(seed = 0) {
            this.seed = seed;
            this.p = this.buildPermutationTable(seed);
        }

        /**
         * Build permutation table using LCG
         * @param {bigint|number} seed - Seed value
         * @returns {number[]} Permutation table
         */
        buildPermutationTable(seed) {
            const p = [];
            const random = new LCG(seed);

            for (let i = 0; i < 256; i++) {
                p[i] = i;
            }

            // Fisher-Yates shuffle
            for (let i = 255; i > 0; i--) {
                const j = Math.floor(random.next() * (i + 1));
                [p[i], p[j]] = [p[j], p[i]];
            }

            return [...p, ...p];
        }

        /**
         * Fade function for smooth interpolation
         * @param {number} t - Input value
         * @returns {number} Faded value
         */
        fade(t) {
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        /**
         * Linear interpolation
         * @param {number} t - Interpolation factor
         * @param {number} a - Start value
         * @param {number} b - End value
         * @returns {number} Interpolated value
         */
        lerp(t, a, b) {
            return a + t * (b - a);
        }

        /**
         * Gradient function
         * @param {number} hash - Hash value
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @returns {number} Gradient value
         */
        grad(hash, x, y) {
            const h = hash & 15;
            const u = h < 8 ? x : y;
            const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        }

        /**
         * 2D Perlin noise
         * @param {number} x - X coordinate
         * @param {number} y - Y coordinate
         * @returns {number} Noise value in [-1, 1]
         */
        noise2(x, y) {
            const X = Math.floor(x) & 255;
            const Y = Math.floor(y) & 255;

            x -= Math.floor(x);
            y -= Math.floor(y);

            const u = this.fade(x);
            const v = this.fade(y);

            const A = this.p[X] + Y;
            const AA = this.p[A];
            const AB = this.p[A + 1];
            const B = this.p[X + 1] + Y;
            const BA = this.p[B];
            const BB = this.p[B + 1];

            return this.lerp(
                v,
                this.lerp(u, this.grad(this.p[AA], x, y), this.grad(this.p[BA], x - 1, y)),
                this.lerp(u, this.grad(this.p[AB], x, y - 1), this.grad(this.p[BB], x - 1, y - 1))
            );
        }

        /**
         * Fractional Brownian Motion
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
            if (this.isRunning) {
                this.stop();
            }
            this.callback = callback;
            this.frame = 0;
            this.lastTime = performance.now();
            this.isRunning = true;
            this.run();
        }

        /**
         * Stop the timer
         */
        stop() {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.isRunning = false;
        }

        /**
         * Internal run loop with drift correction
         */
        run() {
            const now = performance.now();
            const elapsed = now - this.lastTime;

            if (elapsed >= this.interval) {
                this.callback(this.frame);
                this.frame++;
                // Use fixed timestep to prevent drift accumulation
                this.lastTime += this.interval;
                // If we're significantly behind, skip frames but don't accumulate too much
                if (now - this.lastTime > this.interval * 2) {
                    this.lastTime = now;
                }
            }

            this.animationFrameId = requestAnimationFrame(() => this.run());
        }
    }

    // ============================================
    // Color conversion utilities
    // ============================================

    /**
     * Modulate RGB based on intensity using grantwinney.com algorithm
     * Uses candle color temperature (1800K-2000K)
     * @param {number} intensity - Intensity value in [0, 1]
     * @returns {Object} RGB color object with r, g, b in [0, 255]
     */
    function modulateCandleColor(intensity) {
        // Clamp intensity to [0, 1]
        intensity = Math.max(0, Math.min(1, intensity));

        // Candle color range: 1800K (deep orange) to 2000K (warm yellow)
        // At 1800K: R=255, G=90, B=0
        // At 2000K: R=255, G=145, B=40

        // Interpolate RGB between 1800K and 2000K
        const r = 255; // Red stays at 255 across candle range
        const g = Math.round(90 + intensity * 55); // 90 to 145
        const b = Math.round(intensity * 40); // 0 to 40

        // Apply grantwinney.com modulation:
        // Red: pow(intensity + 0.1, 0.75) - stays brighter longer
        // Green: pow(intensity, 2) - fades faster
        // Blue: pow(intensity, 1.5) - fades fastest
        const finalR = Math.round(r * Math.pow(Math.min(intensity + 0.1, 1.0), 0.75));
        const finalG = Math.round(g * Math.pow(intensity, 2));
        const finalB = Math.round(b * Math.pow(intensity, 1.5));

        return { r: finalR, g: finalG, b: finalB };
    }

    /**
     * Convert HSV to RGB
     * @param {number} h - Hue in [0, 1]
     * @param {number} s - Saturation in [0, 1]
     * @param {number} v - Value in [0, 1]
     * @returns {Object} RGB color object with values in [0, 255]
     */
    function hsvToRgb(h, s, v) {
        let r, g, b;

        if (s === 0) {
            r = g = b = v;
        } else {
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
            }
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    /**
     * Convert RGB to HSV for display
     * @param {number} r - Red value in [0, 255]
     * @param {number} g - Green value in [0, 255]
     * @param {number} b - Blue value in [0, 255]
     * @returns {Object} HSV color object with h in [0, 360], s and v in [0, 100]
     */
    function rgbToHsv(r, g, b) {
        r = r / 255;
        g = g / 255;
        b = b / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        if (delta > 0) {
            if (max === r) {
                h = 60 * (((g - b) / delta) % 6);
            } else if (max === g) {
                h = 60 * (((b - r) / delta) + 2);
            } else {
                h = 60 * (((r - g) / delta) + 4);
            }
        }

        if (h < 0) h += 360;

        const s = max === 0 ? 0 : delta / max;
        const v = max;

        return {
            h: Math.round(h),
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }

    // ============================================
    // Blink Patterns
    // ============================================

    /**
     * Pattern definitions
     * Each pattern has a name and an execute function
     * @type {Object.<string, {name: string, execute: Function, usesPerlin?: boolean}>}
     */
    const patterns = {
        rgbSweep: {
            name: 'RGB Color Sweep',
            usesPerlin: false,
            /**
             * Goes around color circle with constant intensity
             * @param {number} timerFrame - Current frame number
             * @param {LCG} prng - PRNG instance
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Advance PRNG to keep state moving
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

                // fBm for smooth, natural-looking flicker
                const flickerNoise = perlin.fBm(time, 0, 4, 0.5, 2.0);

                // Map noise range [-1,1] to intensity range [0.6, 1.0]
                const intensity = CANDLE_PARAMS.BASE_INTENSITY + flickerNoise * CANDLE_PARAMS.FLICKER_RANGE;

                // Get RGB based on intensity using grantwinney.com algorithm
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
                const flicker1 = perlin.fBm(time * 2, 0, 3, 0.6, 2.0);

                // Secondary flicker - slower, larger variations
                const flicker2 = perlin.fBm(time * 0.5, 50, 4, 0.4, 2.0);

                // Combine flickers for more natural effect
                let intensity = 0.7 + (flicker1 * 0.15 + flicker2 * 0.1) + 0.15;
                intensity = Math.min(intensity, CANDLE_PARAMS.MAX_INTENSITY);

                // Get RGB using color temperature modulation
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
             * LFSR with shaping filter - extremely low computational cost
             * Uses deterministic pseudo-random with analog shaping
             * @param {number} timerFrame - Current frame number
             * @param {LCG} prng - PRNG instance (used for LFSR seed)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Use frame as seed for LFSR to get different sequences
                const lfsr = new LFSR(timerFrame % 256);

                // Run LFSR for a few cycles based on speed
                for (let i = 0; i < Math.max(1, Math.floor(speed)); i++) {
                    lfsr.next();
                }

                // Get intensity from LFSR output (map 0-255 to 0-1)
                const intensity = (lfsr.flicker / 255.0) * 0.4 + LFSR_PARAMS.MIN_BRIGHTNESS;

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
             * @param {LCG} prng - PRNG instance (used for oscillator seed)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Use frame as seed for oscillator
                const oscillator = new DampedHarmonicOscillator(timerFrame);

                // Run oscillator for a few cycles based on speed
                let intensity = CANDLE_PARAMS.BASE_INTENSITY;
                for (let i = 0; i < Math.max(1, Math.floor(speed * 2)); i++) {
                    intensity = oscillator.next();
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
             * @param {LCG} prng - PRNG instance (used for random walk seed)
             * @param {number} speed - Speed multiplier
             * @returns {Object} Pattern result with r, g, b, intensity
             */
            execute: function(timerFrame, prng, speed) {
                // Use frame as seed for random walk
                const walker = new ConstrainedRandomWalk(timerFrame);

                // Run random walk for a few cycles based on speed
                let intensity = CANDLE_PARAMS.CENTER_INTENSITY;
                for (let i = 0; i < Math.max(1, Math.floor(speed * 3)); i++) {
                    intensity = walker.next();
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
            const speedSelect = document.getElementById('speed');
            const resetBtn = document.getElementById('reset');
            const colorDisplay = document.getElementById('colorDisplay');
            const intensityDisplay = document.getElementById('intensityDisplay');

            // Info elements
            const infoPattern = document.getElementById('infoPattern');
            const infoTimer = document.getElementById('infoTimer');
            const infoPrng = document.getElementById('infoPrng');
            const infoRgb = document.getElementById('infoRgb');
            const infoIntensity = document.getElementById('infoIntensity');
            const infoHsv = document.getElementById('infoHsv');

            // Validate DOM elements exist
            const requiredElements = [
                patternSelect, speedSelect, resetBtn, colorDisplay, intensityDisplay,
                infoPattern, infoTimer, infoPrng, infoRgb, infoIntensity, infoHsv
            ];

            for (const el of requiredElements) {
                if (!el) {
                    throw new Error(`Required DOM element not found: ${el ? el.id : 'unknown'}`);
                }
            }

            // Initialize PRNG and Timer
            const prng = new LCG();
            const timer = new Timer(60);

            // Cache PerlinNoise instances for patterns that need them
            const perlinInstances = {};
            for (const patternName in patterns) {
                if (patterns[patternName].usesPerlin) {
                    perlinInstances[patternName] = new PerlinNoise(prng.state);
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

            /**
             * Update UI with current state
             * @param {Object} result - Pattern result with r, g, b, intensity
             * @param {number} frame - Current frame number
             * @param {string} prngState - PRNG state string
             */
            function updateUI(result, frame, prngState) {
                try {
                    // Update color display
                    colorDisplay.style.backgroundColor = `rgb(${result.r}, ${result.g}, ${result.b})`;

                    // Update intensity display
                    const intensityPercent = result.intensity * 100;
                    intensityDisplay.style.backgroundColor = `rgba(255, 255, 255, ${result.intensity})`;
                    intensityDisplay.style.boxShadow = `0 0 20px rgba(255, 255, 255, ${result.intensity})`;

                    // Update info with fixed-width formatting
                    infoTimer.textContent = frame.toString().padStart(6, ' ');
                    infoPrng.textContent = prngState.padStart(20, '0');
                    infoPattern.textContent = patterns[currentPattern].name;
                    infoRgb.textContent = `(${result.r.toString().padStart(3, ' ')}, ${result.g.toString().padStart(3, ' ')}, ${result.b.toString().padStart(3, ' ')})`;
                    infoIntensity.textContent = `${Math.round(intensityPercent).toString().padStart(3, ' ')}%`;

                    const hsv = rgbToHsv(result.r, result.g, result.b);
                    infoHsv.textContent = `(${hsv.h.toString().padStart(3, ' ')}\u00b0, ${hsv.s.toString().padStart(3, ' ')}%, ${hsv.v.toString().padStart(3, ' ')}%)`;
                } catch (error) {
                    console.error('Error updating UI:', error);
                }
            }

            /**
             * Timer callback
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
                        // Pass PRNG for non-Perlin patterns
                        result = patterns[currentPattern].execute(frame, prng, speed);
                    }

                    updateUI(result, frame, prng.getState());
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
                    // Update the PerlinNoise instance for the new pattern if it uses Perlin
                    if (patterns[currentPattern].usesPerlin) {
                        perlinInstances[currentPattern] = new PerlinNoise(prng.state);
                    }
                } else {
                    console.warn(`Unknown pattern: ${patternName}, falling back to rgbSweep`);
                    currentPattern = 'rgbSweep';
                    patternSelect.value = 'rgbSweep';
                    prng.reset();
                }
            }

            // Event listeners
            patternSelect.addEventListener('change', (e) => {
                changePattern(e.target.value);
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
                // Update PerlinNoise instances with new seed
                for (const key in perlinInstances) {
                    perlinInstances[key] = new PerlinNoise(prng.state);
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
