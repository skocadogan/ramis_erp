import io
from weasyprint import HTML, CSS
from django.core.files.base import ContentFile
from .renderer import ReportRenderer

class PDFExportService:
    def __init__(self):
        self.renderer = ReportRenderer()

    def generate_pdf_from_html(self, rendered_html: str, css_content: str = None) -> bytes:
        """
        Converts already rendered HTML to PDF bytes.
        """
        html = HTML(string=rendered_html)
        stylesheets = []
        if css_content:
            stylesheets.append(CSS(string=css_content))
            
        pdf_bytes = html.write_pdf(stylesheets=stylesheets)
        return pdf_bytes

    def generate_pdf(self, html_content: str, css_content: str = None, context: dict = None) -> bytes:
        """
        Renders HTML string with context and converts it to PDF bytes.
        """
        context = context or {}
        rendered_html = self.renderer.render_string(html_content, context)
        return self.generate_pdf_from_html(rendered_html, css_content)

    def generate_pdf_from_template(self, template, context: dict) -> bytes:
        """
        Takes a ReportTemplate model instance and context.
        """
        return self.generate_pdf(
            html_content=template.html_body,
            css_content=template.css_styles,
            context=context
        )
