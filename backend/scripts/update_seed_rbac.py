# Temporary script to inject customers category, permissions and update roles in seed_rbac.py
import re

file_path = "backend/rbac/management/commands/seed_rbac.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Inject Category
if 'code": "customers"' not in content:
    audit_category_block = '''    {
        "code": "audit",
        "name_tr": "Denetim & Uyumluluk",
        "name_en": "Audit & Compliance",
        "name_bg": "Одит и съответствие",
        "name_sq": "Audit dhe Pajtueshmëri",
        "description_tr": "Uygulama genelinde operasyonel denetim izi ve log yönetimi",
        "description_en": "Application-wide operational audit trail and log management",
        "description_bg": "Оперативен одитен запис и управление на логове в приложението",
        "description_sq": "Gjurmë auditimi operacionale dhe menaxhim i regjistrave në të gjithë aplikacionin"
    },'''
    customers_category = """
    {
        "code": "customers",
        "name_tr": "Müşteri Yönetimi",
        "name_en": "Customer Management",
        "name_bg": "Управление на клиенти",
        "name_sq": "Menaxhimi i Klientëve",
        "description_tr": "Müşteri tanımları ve analizleri",
        "description_en": "Customer profiles and analytics",
        "description_bg": "Müşteri tanımları",
        "description_sq": "Müşteri tanımları"
    },"""
    content = content.replace(audit_category_block, audit_category_block + customers_category)

# 2. Inject Permissions
audit_perm_line = '{"code": "audit.export_auditlog", "name_tr": "Denetim Kaydı Dışa Aktarma (CSV)", "name_en": "Export Audit Log (CSV)", "name_bg": "Експорт на одиten zapisi (CSV)", "name_sq": "Eksporto Regjistër Auditi (CSV)", "category": "audit"},'
# Let's find exactly by checking part of it
audit_perm_pattern = r'\{\"code\":\s*\"audit\.export_auditlog\".*?category\":\s*\"audit\"\},'
match_perm = re.search(audit_perm_pattern, content)
if match_perm and 'code": "customers.view_customer"' not in content:
    matched_text = match_perm.group(0)
    customers_perms = """
    {"code": "customers.view_customer", "name_tr": "Müşteri Görüntüleme", "name_en": "View Customer", "name_bg": "Преглед на klient", "name_sq": "Shiko Klient", "category": "customers"},
    {"code": "customers.manage_customer", "name_tr": "Müşteri Yönetimi", "name_en": "Manage Customer", "name_bg": "Управление на klient", "name_sq": "Menaxho Klient", "category": "customers"},"""
    content = content.replace(matched_text, matched_text + customers_perms)

# 3. Inject into Branch Manager permissions (Şube Müdürü)
# Find the Şube Müdürü permissions block
manager_perms_pattern = r'\"name_tr\":\s*\"Şube Müdürü\".*?\"permissions\":\s*\[(.*?)\]'
match_mgr = re.search(manager_perms_pattern, content, re.DOTALL)
if match_mgr:
    perms_block = match_mgr.group(1)
    if '"customers.view_customer"' not in perms_block:
        # We append our permissions to the end of the Şube Müdürü permissions list
        # Let's find the last permission in the block, e.g. "takeaway.manage_takeaway",
        last_perm = '"takeaway.manage_takeaway",'
        if last_perm in perms_block:
            new_perms_block = perms_block.replace(last_perm, last_perm + '\n            "customers.view_customer",\n            "customers.manage_customer",')
            content = content.replace(perms_block, new_perms_block)

# 4. Inject into Kasiyer permissions
kasiyer_perms_pattern = r'\"name_tr\":\s*\"Kasiyer\".*?\"permissions\":\s*\[(.*?)\]'
match_kas = re.search(kasiyer_perms_pattern, content, re.DOTALL)
if match_kas:
    perms_block = match_kas.group(1)
    if '"customers.view_customer"' not in perms_block:
        last_perm = '"printing.direct_print",'
        if last_perm in perms_block:
            new_perms_block = perms_block.replace(last_perm, last_perm + '\n            "customers.view_customer",')
            content = content.replace(perms_block, new_perms_block)

# 5. Inject into Garson permissions
garson_perms_pattern = r'\"name_tr\":\s*\"Garson\".*?\"permissions\":\s*\[(.*?)\]'
match_gar = re.search(garson_perms_pattern, content, re.DOTALL)
if match_gar:
    perms_block = match_gar.group(1)
    if '"customers.view_customer"' not in perms_block:
        last_perm = '"reporting.generate_report",'
        if last_perm in perms_block:
            new_perms_block = perms_block.replace(last_perm, last_perm + '\n            "customers.view_customer",')
            content = content.replace(perms_block, new_perms_block)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("seed_rbac.py updated successfully using regex logic!")
