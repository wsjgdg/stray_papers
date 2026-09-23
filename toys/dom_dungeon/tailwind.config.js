import animate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
      /* __DS_BURN_START__ */
      fontFamily: { sans: ["var(--font-body)"], display: ["var(--font-display)"], mono: ["var(--font-mono)"] },
      spacing: { "1": "var(--space-1)", "12": "var(--space-12)", "2": "var(--space-2)", "3": "var(--space-3)", "4": "var(--space-4)", "5": "var(--space-5)", "6": "var(--space-6)", "8": "var(--space-8)" },
      boxShadow: { "none": "var(--elev-flat)", "sm": "var(--elev-ring)", "DEFAULT": "var(--elev-raised)", "md": "var(--elev-raised)", "lg": "var(--elev-raised)", "xl": "var(--elev-raised)", "focus": "var(--focus-ring)", "glow-cyan": "var(--glow-cyan)", "glow-purple": "var(--glow-purple)", "glow-red": "var(--glow-red)", "glow-green": "var(--glow-green)", "glow-gold": "var(--glow-gold)" },
      fontSize: { "2xl": ["var(--text-2xl)", "var(--leading-tight)"], "3xl": ["var(--text-3xl)", "var(--leading-tight)"], "4xl": ["var(--text-4xl)", "var(--leading-tight)"], "base": ["var(--text-base)", "var(--leading-body)"], "lg": ["var(--text-lg)", "var(--leading-tight)"], "sm": ["var(--text-sm)", "var(--leading-body)"], "xl": ["var(--text-xl)", "var(--leading-tight)"], "xs": ["var(--text-xs)", "var(--leading-body)"] }, /* __DS_BURN_END__ */
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			textDisabled: 'hsl(var(--text-disabled) / <alpha-value>)',
			sys: {
				script: 'hsl(var(--sys-script) / <alpha-value>)',
				'script-deep': 'hsl(var(--sys-script-deep) / <alpha-value>)',
				style: 'hsl(var(--sys-style) / <alpha-value>)',
				'style-deep': 'hsl(var(--sys-style-deep) / <alpha-value>)',
				network: 'hsl(var(--sys-network) / <alpha-value>)',
				'network-deep': 'hsl(var(--sys-network-deep) / <alpha-value>)',
				cache: 'hsl(var(--sys-cache) / <alpha-value>)',
				'cache-deep': 'hsl(var(--sys-cache-deep) / <alpha-value>)',
				general: 'hsl(var(--sys-general) / <alpha-value>)',
				'general-deep': 'hsl(var(--sys-general-deep) / <alpha-value>)'
			},
			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			xl: 'var(--radius-xl)',
  			card: 'var(--radius-lg)',
  			'btn': 'var(--radius-md)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  	  		keyframes: {
	  			'accordion-down': {
	  				from: { height: '0' },
	  				to: { height: 'var(--radix-accordion-content-height)' }
	  			},
	  			'accordion-up': {
	  				from: { height: 'var(--radix-accordion-content-height)' },
	  				to: { height: '0' }
	  			},
	  			'glow-pulse': {
	  				'0%, 100%': { boxShadow: '0 0 8px rgba(177, 78, 255, 0.35)' },
	  				'50%': { boxShadow: '0 0 20px rgba(177, 78, 255, 0.6)' }
	  			},
	  			'pulse-soft': {
	  				'0%, 100%': { opacity: '1' },
	  				'50%': { opacity: '0.55' }
	  			}
	  		},
	  		animation: {
	  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'glow-pulse': 'glow-pulse 1.6s var(--ease-in-out) infinite',
  			'pulse-soft': 'pulse-soft 1.6s var(--ease-in-out) infinite'
  		}
  	}
  },
  plugins: [animate],
}
