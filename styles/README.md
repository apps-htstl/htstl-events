# Theming & Styling System

This project uses a reusable, token-based theming system with SCSS for web and React Native StyleSheet for mobile.

## File Structure

```
styles/
├── theme.scss                 # SCSS variables and mixins for web/design
└── components/
    └── home.styles.ts        # React Native StyleSheet for mobile (home page example)
```

## Colors

The theme defines a consistent color palette:

- **Primary**: `#2b0d12` (Dark burgundy), `#5a1a2e`, `#8b3a4e`
- **Accent**: `#d4a83f` (Gold), `#f97316` (Orange)
- **Secondary**: `#059669` (Green), `#6d28d9` (Purple)
- **Grays**: Full spectrum from `#ffffff` to `#111827`
- **Status**: Success, Warning, Error, Info colors

## Spacing Scale

```
xs:  4px     (0.25rem)
sm:  8px     (0.5rem)
md:  16px    (1rem)
lg:  24px    (1.5rem)
xl:  32px    (2rem)
2xl: 40px    (2.5rem)
3xl: 48px    (3rem)
```

## Typography

- **Sizes**: xs (12px) → 4xl (36px)
- **Weights**: light, normal, medium, semibold, bold
- **Font families**: System fonts (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto)

## Shadow Levels

- `sm`: Light shadow
- `md`: Medium shadow
- `lg`: Strong shadow
- `xl`: Extra strong shadow

## Border Radius

- `sm`: 4px
- `md`: 8px
- `lg`: 12px
- `xl`: 16px
- `2xl`: 24px
- `full`: 9999px (rounded circle)

## Usage

### React Native

Import the theme and styles:

```typescript
import { THEME, homeStyles } from '@/styles/components/home.styles';

// Use theme values
<View style={{ backgroundColor: THEME.colors.primaryDark }}>
  <Text style={{ fontSize: THEME.typography.sizes.lg }}>Title</Text>
</View>

// Use pre-built style classes
<View style={homeStyles.card}>
  <Text style={homeStyles.cardTitle}>Card Title</Text>
</View>
```

### Web (SCSS)

Import the theme variables:

```scss
@import "@/styles/theme.scss";

.header {
  background-color: $color-primary-dark;
  padding: $spacing-lg;

  .title {
    font-size: $font-size-2xl;
    font-weight: $font-weight-bold;
    color: $color-accent-gold;
  }
}

// Use mixins
.button {
  @include flex-center;
  @include box-shadow("md");
  @include transition(all, $transition-base);
}

// Responsive
.container {
  padding: $spacing-md;

  @include respond-to("md") {
    padding: $spacing-lg;
  }
}
```

## Design System Benefits

1. **Consistency**: All colors, sizes, and spacing are centralized
2. **Maintainability**: Change the theme once, update everywhere
3. **Reusability**: Pre-built component styles reduce duplication
4. **Scalability**: Easy to add new themes or variants
5. **Accessibility**: Proper contrast and sizing built-in

## Extending the Theme

To add new theme values:

1. Add to `theme.scss` (for web/design)
2. Add to `THEME` object in `home.styles.ts` (for React Native)
3. Create corresponding style classes if needed

Example:

```typescript
// In THEME object
colors: {
  ...existing,
  brandBlue: '#0066cc',
}

// In homeStyles
brandCard: {
  backgroundColor: THEME.colors.brandBlue,
  borderRadius: THEME.radius.lg,
  padding: THEME.spacing.md,
}
```

## Breakpoints

The SCSS theme includes responsive breakpoints:

- `sm`: 576px
- `md`: 768px
- `lg`: 992px
- `xl`: 1200px

Use with the `respond-to` mixin for responsive styles.
