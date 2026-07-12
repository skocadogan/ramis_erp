from django.test import SimpleTestCase
from rest_framework import status

from core.api_responses import detail_response, ok_response


class ApiResponsesTests(SimpleTestCase):
    def test_detail_response_default(self):
        resp = detail_response("Hata mesajı")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "Hata mesajı")
        self.assertNotIn("error", resp.data)

    def test_detail_response_with_code_and_mirror(self):
        resp = detail_response("Çakışma", http_status=409, code="TEST", mirror_error_key=True)
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data["code"], "TEST")
        self.assertEqual(resp.data["error"], "Çakışma")

    def test_ok_response_with_detail_and_data(self):
        resp = ok_response(detail="Tamam", data={"id": 1})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["detail"], "Tamam")
        self.assertEqual(resp.data["data"]["id"], 1)
