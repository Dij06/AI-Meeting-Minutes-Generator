import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_docx(data: dict, output_filepath: str) -> str:
    """Generates a professional DOCX file from structured meeting data."""
    doc = Document()
    
    # Title
    title = doc.add_heading("Minutes of Meeting (MoM)", level=0)
    title.style.font.color.rgb = RGBColor(33, 37, 41)
    
    # Meeting Meta
    meta = data.get("statistics", {})
    doc.add_paragraph(f"File Name: {data.get('filename', 'Meeting Recording')}")
    doc.add_paragraph(f"Duration: {meta.get('duration', 'N/A')} | Word Count: {meta.get('word_count', 'N/A')}")
    doc.add_paragraph("---")
    
    # Summary
    doc.add_heading("1. Executive Summary", level=1)
    doc.add_paragraph(data.get("summary", "No summary available."))
    
    # Key Discussion Points
    doc.add_heading("2. Key Discussion Points", level=1)
    for point in data.get("discussion_points", []):
        doc.add_paragraph(f"• {point}")
        
    # Decisions Made
    doc.add_heading("3. Decisions Made", level=1)
    for decision in data.get("decisions", []):
        doc.add_paragraph(f"• {decision}")
        
    # Action Items Table
    doc.add_heading("4. Action Items & Assignments", level=1)
    action_items = data.get("action_items", [])
    if action_items:
        table = doc.add_table(rows=1, cols=3)
        table.style = "Table Grid"
        hdr_cells = table.rows[0].cells
        hdr_cells[0].text = "Task"
        hdr_cells[1].text = "Assignee"
        hdr_cells[2].text = "Deadline"
        
        for item in action_items:
            row_cells = table.add_row().cells
            row_cells[0].text = item.get("task", "")
            row_cells[1].text = item.get("assignee", "Unassigned")
            row_cells[2].text = item.get("deadline", "None")
    else:
        doc.add_paragraph("No specific action items identified.")
        
    # Transcript
    if data.get("transcript"):
        doc.add_heading("5. Full Transcript", level=1)
        doc.add_paragraph(data.get("transcript"))
        
    doc.save(output_filepath)
    return output_filepath

def generate_pdf(data: dict, output_filepath: str) -> str:
    """Generates a professional PDF file from structured meeting data."""
    pdf = SimpleDocTemplate(output_filepath, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1f2937'),
        alignment=0
    )
    h1_style = ParagraphStyle(
        'Heading1Custom',
        parent=styles['Heading2'],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#2563eb'),
        spaceBefore=12,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#374151')
    )
    meta_style = ParagraphStyle(
        'MetaCustom',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#6b7280')
    )
    
    story.append(Paragraph("Minutes of Meeting (MoM)", title_style))
    story.append(Spacer(1, 4))
    
    meta = data.get("statistics", {})
    meta_text = f"File: {data.get('filename', 'Meeting Recording')} | Duration: {meta.get('duration', 'N/A')} | Words: {meta.get('word_count', 'N/A')}"
    story.append(Paragraph(meta_text, meta_style))
    story.append(Spacer(1, 10))
    
    # Summary
    story.append(Paragraph("1. Executive Summary", h1_style))
    story.append(Paragraph(data.get("summary", "No summary available."), body_style))
    story.append(Spacer(1, 8))
    
    # Discussion points
    story.append(Paragraph("2. Key Discussion Points", h1_style))
    for pt in data.get("discussion_points", []):
        story.append(Paragraph(f"• {pt}", body_style))
    story.append(Spacer(1, 8))
    
    # Decisions
    story.append(Paragraph("3. Decisions Made", h1_style))
    for dec in data.get("decisions", []):
        story.append(Paragraph(f"• {dec}", body_style))
    story.append(Spacer(1, 8))
    
    # Action items table
    story.append(Paragraph("4. Action Items & Assignments", h1_style))
    action_items = data.get("action_items", [])
    if action_items:
        table_data = [["Task", "Assignee", "Deadline"]]
        for item in action_items:
            table_data.append([
                Paragraph(item.get("task", ""), body_style),
                Paragraph(item.get("assignee", "Unassigned"), body_style),
                Paragraph(item.get("deadline", "None"), body_style)
            ])
        t = Table(table_data, colWidths=[280, 120, 130])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No specific action items identified.", body_style))
        
    pdf.build(story)
    return output_filepath
