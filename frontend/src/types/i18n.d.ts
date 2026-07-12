/**
 * next-intl TypeScript tip güvenliği.
 * TR mesajları kaynak tip olarak kullanılır.
 * Tanımsız anahtar kullanımı derleme zamanında hata verir.
 */

import tr_common from '../i18n/messages/tr/common.json';
import tr_auth from '../i18n/messages/tr/auth.json';
import tr_pos from '../i18n/messages/tr/pos.json';
import tr_kds from '../i18n/messages/tr/kds.json';
import tr_inventory from '../i18n/messages/tr/inventory.json';
import tr_branches from '../i18n/messages/tr/branches.json';
import tr_menu_management from '../i18n/messages/tr/menu_management.json';
import tr_tables from '../i18n/messages/tr/tables.json';
import tr_users from '../i18n/messages/tr/users.json';
import tr_waiter from '../i18n/messages/tr/waiter.json';
import tr_warehouse from '../i18n/messages/tr/warehouse.json';
import tr_sales from '../i18n/messages/tr/sales.json';
import tr_shifts from '../i18n/messages/tr/shifts.json';
import tr_admin from '../i18n/messages/tr/admin.json';
import tr_dashboard from '../i18n/messages/tr/dashboard.json';
import tr_recipes from '../i18n/messages/tr/recipes.json';
import tr_invoices from '../i18n/messages/tr/invoices.json';
import tr_reservations from '../i18n/messages/tr/reservations.json';
import tr_credit from '../i18n/messages/tr/credit.json';
import tr_production from '../i18n/messages/tr/production.json';
import tr_prep from '../i18n/messages/tr/prep.json';
import tr_reporting from '../i18n/messages/tr/reporting.json';
import tr_errors from '../i18n/messages/tr/errors.json';
import tr_recycle_bin from '../i18n/messages/tr/recycle_bin.json';

type Messages = {
  common: typeof tr_common;
  auth: typeof tr_auth;
  pos: typeof tr_pos;
  kds: typeof tr_kds;
  inventory: typeof tr_inventory;
  branches: typeof tr_branches;
  menu_management: typeof tr_menu_management;
  tables: typeof tr_tables;
  users: typeof tr_users;
  waiter: typeof tr_waiter;
  warehouse: typeof tr_warehouse;
  sales: typeof tr_sales;
  shifts: typeof tr_shifts;
  admin: typeof tr_admin;
  dashboard: typeof tr_dashboard;
  recipes: typeof tr_recipes;
  invoices: typeof tr_invoices;
  reservations: typeof tr_reservations;
  credit: typeof tr_credit;
  production: typeof tr_production;
  prep: typeof tr_prep;
  reporting: typeof tr_reporting;
  errors: typeof tr_errors;
  recycle_bin: typeof tr_recycle_bin;
};

declare module 'next-intl' {
  type AppMessages = Messages
}
