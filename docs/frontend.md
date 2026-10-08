# PeopleOS HRMS — Frontend Architecture

## 1. Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS with custom HRMS token presets
- **Component Primitives**: Custom design system in `@hrms/ui`
- **Iconography**: Lucide React
- **Data Visualization**: Recharts

## 2. Directory Layout (`apps/web/src`)

- `app/`: Next.js file-system routing
  - `dashboard/`: Role-aware central dashboard shell
  - `employees/`: Employee directory, directory filters and modal profiles
  - `attendance/`: Attendance hub with Office, OD, and WFH tracking
  - `leave/`: Leave balance overview and application drawer/dialog
  - `visits/`: Outdoor duty (Official Visits) requests and approvals
  - `reports/`: MIS workforce analytics and scheduled reports
  - `settings/`: Organization configuration and geofence parameters
- `context/`: `RoleContext` for live testing of ADMIN, HR, MANAGER, and EMPLOYEE views
- `features/`: Feature-sliced modules and Recharts visualizations
- `layouts/`: `AppShell`, `Sidebar`, `Header`, and responsive navigation
- `styles/`: Global styles and font definitions

## 3. Role Switcher for Testing

In Phase 1, `RoleContext` provides a live switcher in the top navigation header. Testers and reviewers can switch between any of the 4 personas with a single click. The sidebar, breadcrumbs, metrics, and dashboards instantly adapt.
