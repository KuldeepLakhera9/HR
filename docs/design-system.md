# PeopleOS HRMS — Design System

## 1. Design Direction

Inspired by modern human resource software (Keka, greytHR), PeopleOS uses a calm, warm, and professional palette designed to reduce visual fatigue and communicate clear state semantics.

## 2. Color Palette Tokens

- **Primary Brand**: Warm Amber / Gold
  - 500: `#F59E0B`
  - 600: `#D97706` (Primary action button, active nav)
  - 700: `#B45309` (Hover & active highlights)
- **Background**: Warm Ivory & Off-white
  - Default: `#FAF8F5`
  - Subtle: `#F5F2EB`
- **Surfaces**: Crisp White
  - Cards & Modals: `#FFFFFF` with subtle 1px border (`#E7E2DA`)
- **Text**: Deep Charcoal
  - Primary: `#1C1917`
  - Secondary: `#44403C`
  - Muted: `#78716C`
- **Semantic Status**:
  - Green (Success/Present): `#10B981` / `#ECFDF5`
  - Orange (Warning/Pending): `#F59E0B` / `#FFFBEB`
  - Red (Danger/Absent): `#EF4444` / `#FEF2F2`
  - Blue (Info/Remote/WFH): `#3B82F6` / `#EFF6FF`
  - Purple (Outdoor Duty/Official Visit): `#8B5CF6` / `#FAF5FF`

## 3. Typography Scale

- **Display**: 24px - 30px Bold (Page titles)
- **Section Titles**: 16px - 18px SemiBold
- **Body**: 13px - 14px Regular
- **Labels & Captions**: 11px - 12px Medium
- **Numeric KPIs**: 24px - 28px Bold tracking-tight

## 4. Reusable Component Catalog (`@hrms/ui`)

- Form Controls: `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
- Presentation: `Badge`, `Avatar`, `Tooltip`, `Card`, `KPICard`, `StatCard`, `ChartCard`
- Data Display: `Table`, `DataTable`, `Search`, `Filter`, `DatePicker`, `Pagination`
- Feedback & Overlays: `Dialog`, `Drawer`, `Dropdown`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState`
- Navigation: `Breadcrumb`, `Tabs`, `UserMenu`, `NotificationMenu`
