package com.example.demo.service;

import com.example.demo.dto.CotizacionPdfResponse;
import com.example.demo.exception.ResourceNotFoundException;
import com.example.demo.model.Cliente;
import com.example.demo.model.ContactoCliente;
import com.example.demo.model.Cotizacion;
import com.example.demo.model.CotizacionDetalle;
import com.example.demo.repository.ContactoClienteRepository;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CotizacionPdfService {
    private static final Color COLOR_VERDE_BIO = new Color(0x6d, 0xa7, 0x2f);
    private static final Color COLOR_AZUL_FLUIDO = new Color(0x2a, 0x6f, 0xb3);
    private static final Color COLOR_FONDO_SUAVE = new Color(0xf5, 0xf8, 0xf3);
    private static final Color COLOR_FONDO_SECUNDARIO = new Color(0xee, 0xf5, 0xea);
    private static final Color COLOR_BORDE = new Color(0xd8, 0xe2, 0xd2);
    private static final Color COLOR_TEXTO = new Color(0x17, 0x20, 0x14);
    private static final Color COLOR_TEXTO_SECUNDARIO = new Color(0x5c, 0x66, 0x58);
    private static final Color COLOR_WHITE = Color.WHITE;

    private static final String LOGO_PATH = "static/images/biofluid-logo.png";
    private static final float MARGIN_LEFT = 34f;
    private static final float MARGIN_RIGHT = 34f;
    private static final float MARGIN_TOP = 30f;
    private static final float MARGIN_BOTTOM = 38f;
    private static final int FONT_TITLE = 16;
    private static final int FONT_SECTION = 10;
    private static final int FONT_BODY = 8;
    private static final int FONT_SMALL = 7;

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DecimalFormat MONEY = moneyFormat();

    private final CotizacionV1Service cotizacionService;
    private final ContactoClienteRepository contactoRepository;
    private final AccessControlService accessControlService;
    private final Path storageDir;

    public CotizacionPdfService(
            CotizacionV1Service cotizacionService,
            ContactoClienteRepository contactoRepository,
            AccessControlService accessControlService,
            @Value("${app.files.cotizaciones-dir:storage/cotizaciones}") String storageDir
    ) {
        this.cotizacionService = cotizacionService;
        this.contactoRepository = contactoRepository;
        this.accessControlService = accessControlService;
        this.storageDir = Path.of(storageDir);
    }

    @Transactional
    public CotizacionPdfResponse generarPdfCotizacion(Integer idCotizacion, String actor) {
        accessControlService.validarPuedeGestionarCotizacion(idCotizacion);
        Cotizacion cotizacion = cotizacionService.findEntity(idCotizacion);
        String fileName = construirNombreArchivo(cotizacion);
        Path file = storageDir.resolve(fileName).normalize();
        try {
            Files.createDirectories(storageDir);
            try (OutputStream output = Files.newOutputStream(file)) {
                writePdf(cotizacion, output);
            }
        } catch (IOException | DocumentException ex) {
            throw new IllegalStateException("No fue posible generar el PDF de la cotizacion.");
        }
        String relativePath = "cotizaciones/" + fileName;
        cotizacionService.updatePdfPath(idCotizacion, relativePath, actor);
        return new CotizacionPdfResponse(idCotizacion, relativePath, fileName, "PDF generado correctamente.");
    }

    @Transactional(readOnly = true)
    public ResponseEntity<Resource> descargarPdfCotizacion(Integer idCotizacion) {
        accessControlService.validarPuedeVerCotizacion(idCotizacion);
        Cotizacion cotizacion = cotizacionService.findEntity(idCotizacion);
        if (cotizacion.pdfPath == null || cotizacion.pdfPath.isBlank()) {
            throw new ResourceNotFoundException("PDF de cotizacion", idCotizacion);
        }
        Path file = resolvePdfPath(cotizacion.pdfPath);
        if (!Files.exists(file)) {
            throw new ResourceNotFoundException("PDF de cotizacion", idCotizacion);
        }
        Resource resource = new FileSystemResource(file);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(file.getFileName().toString()).build().toString())
                .body(resource);
    }

    public String construirNombreArchivo(Cotizacion cotizacion) {
        String fecha = cotizacion.fechaEmision == null ? FILE_DATE.format(LocalDateTime.now()) : cotizacion.fechaEmision.format(FILE_DATE);
        return "COTIZACION-C001-" + String.format("%06d", cotizacion.idCotizacion) + "-" + fecha + ".pdf";
    }

    private void writePdf(Cotizacion cotizacion, OutputStream output) throws DocumentException, IOException {
        Document document = new Document(PageSize.A4, MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP, MARGIN_BOTTOM);
        PdfWriter writer = PdfWriter.getInstance(document, output);
        writer.setPageEvent(new FooterEvent());
        document.open();

        addInstitutionalHeader(document, cotizacion);
        addSpacer(document, 8);
        addClientData(document, cotizacion);
        addSpacer(document, 8);
        document.add(itemsTable(cotizacion));
        addSpacer(document, 8);
        document.add(totalsTable(cotizacion));
        addSpacer(document, 8);
        addObservations(document, cotizacion);
        addSpacer(document, 7);
        addCommercialConditions(document);
        addSpacer(document, 7);
        document.add(bankTable());
        addSpacer(document, 8);
        addThanks(document);
        document.close();
    }

    private void addInstitutionalHeader(Document document, Cotizacion cotizacion) throws DocumentException, IOException {
        PdfPTable table = new PdfPTable(new float[] {2.15f, 3.4f, 2.2f});
        table.setWidthPercentage(100);

        PdfPCell logoCell = cell("", bodyFont(), Element.ALIGN_LEFT, Rectangle.BOX);
        logoCell.setBorderColor(COLOR_BORDE);
        logoCell.setPadding(9);
        Image logo = loadLogo();
        if (logo != null) {
            logo.scaleToFit(118f, 58f);
            logoCell.addElement(logo);
        } else {
            logoCell.addElement(new Paragraph("BIOFLUID D-32", titleFont(14, COLOR_AZUL_FLUIDO)));
        }
        table.addCell(logoCell);

        Paragraph company = new Paragraph();
        company.setLeading(10.5f);
        company.add(new Phrase("BIOFLUID D32 E.I.R.L.\n", titleFont(12, COLOR_TEXTO)));
        company.add(new Phrase("RUC: 20613142739\n", bodyFont()));
        company.add(new Phrase("Correo: ventas@biofluidd-32.com\n", smallFont()));
        company.add(new Phrase("Web: https://biofluidd-32.com\n", smallFont()));
        company.add(new Phrase("Direccion: Mza. B Lote. 1 Urb. Altos del Valle - Moche - Trujillo - La Libertad", smallFont()));
        table.addCell(cell(company, Element.ALIGN_LEFT, Rectangle.BOX));

        PdfPTable quoteBox = new PdfPTable(1);
        quoteBox.setWidthPercentage(100);
        quoteBox.addCell(labelValueCell("COTIZACION", cotizacionNumber(cotizacion), FONT_TITLE));
        quoteBox.addCell(infoLine("Emision", formatDate(cotizacion.fechaEmision)));
        quoteBox.addCell(infoLine("Vencimiento", formatDate(cotizacion.fechaVencimiento)));
        quoteBox.addCell(infoLine("Estado", estado(cotizacion)));
        PdfPCell wrapper = new PdfPCell(quoteBox);
        wrapper.setBorder(Rectangle.BOX);
        wrapper.setBorderColor(COLOR_AZUL_FLUIDO);
        wrapper.setPadding(0);
        table.addCell(wrapper);

        document.add(table);
    }

    private void addClientData(Document document, Cotizacion cotizacion) throws DocumentException {
        ContactoCliente contacto = findContact(cotizacion);
        PdfPTable wrapper = sectionTable("Datos del cliente");
        PdfPTable fields = new PdfPTable(new float[] {1.15f, 2.1f, 1.1f, 2f});
        fields.setWidthPercentage(100);

        Cliente cliente = cotizacion.cliente;
        fields.addCell(labelCell("Cliente / Razon social"));
        fields.addCell(valueCell(cliente == null ? null : cliente.razonSocial));
        fields.addCell(labelCell("RUC"));
        fields.addCell(valueCell(cliente == null ? null : cliente.ruc));
        fields.addCell(labelCell("Direccion"));
        fields.addCell(valueCell(firstText(cotizacion.direccionDespacho, cliente == null ? null : cliente.direccion)));
        fields.addCell(labelCell("Ubicacion"));
        fields.addCell(valueCell(location(cotizacion, cliente)));
        fields.addCell(labelCell("Contacto"));
        fields.addCell(valueCell(contacto == null ? null : fullName(contacto)));
        fields.addCell(labelCell("Celular"));
        fields.addCell(valueCell(contacto == null ? null : contacto.celular));
        fields.addCell(labelCell("Moneda"));
        fields.addCell(valueCell(displayMoneda(cotizacion.moneda)));
        fields.addCell(labelCell("Vendedor"));
        fields.addCell(valueCell(fullName(cotizacion.vendedor)));

        wrapper.addCell(contentCell(fields));
        document.add(wrapper);
    }

    private PdfPTable itemsTable(Cotizacion cotizacion) {
        PdfPTable table = new PdfPTable(new float[] {0.55f, 0.75f, 0.75f, 4.15f, 1.05f, 1.1f});
        table.setWidthPercentage(100);
        table.setHeaderRows(1);
        table.setSplitLate(false);
        table.setSplitRows(true);
        for (String title : List.of("ITEM", "CANT.", "U.M.", "DESCRIPCION", "P.U.", "IMPORTE")) {
            table.addCell(tableHeaderCell(title));
        }
        int index = 1;
        for (CotizacionDetalle detalle : cotizacion.detalles) {
            BigDecimal importe = lineAmount(detalle);
            Color rowColor = index % 2 == 0 ? COLOR_FONDO_SUAVE : COLOR_WHITE;
            table.addCell(tableValueCell(String.valueOf(index), Element.ALIGN_CENTER, rowColor));
            table.addCell(tableValueCell(detalle.cantidad == null ? null : String.valueOf(detalle.cantidad), Element.ALIGN_RIGHT, rowColor));
            table.addCell(tableValueCell(detalle.producto == null ? null : detalle.producto.unidadMedida, Element.ALIGN_CENTER, rowColor));
            table.addCell(tableValueCell(detalle.producto == null ? null : detalle.producto.nombreProducto, Element.ALIGN_LEFT, rowColor));
            table.addCell(tableValueCell(formatMoney(detalle.precioUni), Element.ALIGN_RIGHT, rowColor));
            table.addCell(tableValueCell(formatMoney(importe), Element.ALIGN_RIGHT, rowColor));
            index++;
        }
        return table;
    }

    private PdfPTable totalsTable(Cotizacion cotizacion) {
        PdfPTable table = new PdfPTable(new float[] {4.2f, 1.35f, 1.15f});
        table.setWidthPercentage(100);

        PdfPCell words = cell("SON: " + amountInWords(cotizacion.importeTotal, cotizacion.moneda), font(FONT_BODY, Font.BOLD, COLOR_TEXTO), Element.ALIGN_LEFT, Rectangle.BOX);
        words.setBorderColor(COLOR_BORDE);
        words.setBackgroundColor(COLOR_FONDO_SUAVE);
        words.setPadding(8);
        table.addCell(words);
        table.addCell(totalLabelCell("OP. GRAVADA", false));
        table.addCell(totalValueCell(formatMoney(cotizacion.subtotal), false));

        table.addCell(borderless(""));
        table.addCell(totalLabelCell("I.G.V. 18%", false));
        table.addCell(totalValueCell(formatMoney(cotizacion.igv), false));

        table.addCell(borderless(""));
        table.addCell(totalLabelCell("IMPORTE TOTAL", true));
        table.addCell(totalValueCell(currencySymbol(cotizacion.moneda) + " " + formatMoney(cotizacion.importeTotal), true));
        return table;
    }

    private void addObservations(Document document, Cotizacion cotizacion) throws DocumentException {
        String body = cotizacion.observaciones == null || cotizacion.observaciones.isBlank()
                ? "Sin observaciones."
                : cotizacion.observaciones;
        document.add(textSection("Observaciones", body));
    }

    private void addCommercialConditions(Document document) throws DocumentException {
        String body = String.join("\n",
                "- La cotizacion tiene una vigencia de 24 horas desde su emision.",
                "- Los precios estan sujetos a disponibilidad de stock.",
                "- La atencion del pedido se realiza previa confirmacion comercial.",
                "- El stock reservado se libera si la cotizacion vence, se rechaza o se anula.");
        document.add(textSection("Condiciones comerciales", body));
    }

    private PdfPTable bankTable() {
        PdfPTable wrapper = sectionTable("Cuentas bancarias");
        PdfPTable table = new PdfPTable(new float[] {1.2f, 0.9f, 2.1f, 2.5f});
        table.setWidthPercentage(100);
        for (String title : List.of("BANCO", "MONEDA", "NRO. CUENTA", "NRO. CUENTA CCI")) {
            PdfPCell cell = tableHeaderCell(title);
            cell.setBackgroundColor(COLOR_VERDE_BIO);
            table.addCell(cell);
        }
        addBank(table, "INTERBANK", "SOLES", "600300700XXXX", "00360000300700XXXXXX");
        addBank(table, "BBVA", "SOLES", "0011 0146 020048XXXX", "011 146 00020048XXXX XX");
        addBank(table, "BCP", "SOLES", "1910558376XXXX", "00219110558376XXXXXX");
        wrapper.addCell(contentCell(table));
        return wrapper;
    }

    private PdfPTable textSection(String title, String body) {
        PdfPTable wrapper = sectionTable(title);
        PdfPCell content = cell(body, bodyFont(), Element.ALIGN_LEFT, Rectangle.NO_BORDER);
        content.setPadding(9);
        content.setLeading(2f, 1.15f);
        wrapper.addCell(content);
        return wrapper;
    }

    private PdfPTable sectionTable(String title) {
        PdfPTable wrapper = new PdfPTable(1);
        wrapper.setWidthPercentage(100);
        PdfPCell titleCell = cell(title, sectionFont(), Element.ALIGN_LEFT, Rectangle.BOX);
        titleCell.setBorderColor(COLOR_BORDE);
        titleCell.setBackgroundColor(COLOR_FONDO_SECUNDARIO);
        titleCell.setPadding(7);
        wrapper.addCell(titleCell);
        return wrapper;
    }

    private void addThanks(Document document) throws DocumentException {
        Paragraph footer = new Paragraph("Gracias por su preferencia.", font(10, Font.BOLD, COLOR_AZUL_FLUIDO));
        footer.setAlignment(Element.ALIGN_CENTER);
        footer.setSpacingBefore(2);
        document.add(footer);
    }

    private void addBank(PdfPTable table, String bank, String moneda, String cuenta, String cci) {
        table.addCell(tableValueCell(bank, Element.ALIGN_LEFT, COLOR_WHITE));
        table.addCell(tableValueCell(moneda, Element.ALIGN_CENTER, COLOR_WHITE));
        table.addCell(tableValueCell(cuenta, Element.ALIGN_LEFT, COLOR_WHITE));
        table.addCell(tableValueCell(cci, Element.ALIGN_LEFT, COLOR_WHITE));
    }

    private PdfPCell labelValueCell(String title, String value, int titleSize) {
        Paragraph paragraph = new Paragraph();
        paragraph.setAlignment(Element.ALIGN_CENTER);
        paragraph.setLeading(13f);
        paragraph.add(new Phrase(title + "\n", titleFont(titleSize, COLOR_AZUL_FLUIDO)));
        paragraph.add(new Phrase(value, font(10, Font.BOLD, COLOR_TEXTO)));
        PdfPCell cell = new PdfPCell();
        cell.addElement(paragraph);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setPadding(8);
        return cell;
    }

    private PdfPCell infoLine(String label, String value) {
        PdfPCell cell = cell(label + ": " + dash(value), smallFont(), Element.ALIGN_CENTER, Rectangle.NO_BORDER);
        cell.setPadding(3);
        return cell;
    }

    private PdfPCell labelCell(String text) {
        PdfPCell cell = cell(text, font(FONT_SMALL, Font.BOLD, COLOR_TEXTO_SECUNDARIO), Element.ALIGN_LEFT, Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setBackgroundColor(COLOR_FONDO_SUAVE);
        cell.setPadding(6);
        return cell;
    }

    private PdfPCell valueCell(String text) {
        PdfPCell cell = cell(dash(text), bodyFont(), Element.ALIGN_LEFT, Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setPadding(6);
        return cell;
    }

    private PdfPCell tableHeaderCell(String text) {
        PdfPCell cell = cell(text, font(FONT_BODY, Font.BOLD, COLOR_WHITE), Element.ALIGN_CENTER, Rectangle.BOX);
        cell.setBorderColor(COLOR_AZUL_FLUIDO);
        cell.setBackgroundColor(COLOR_AZUL_FLUIDO);
        cell.setPadding(6);
        return cell;
    }

    private PdfPCell tableValueCell(String text, int alignment, Color background) {
        PdfPCell cell = cell(dash(text), bodyFont(), alignment, Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setBackgroundColor(background);
        cell.setPadding(5);
        return cell;
    }

    private PdfPCell totalLabelCell(String text, boolean highlighted) {
        PdfPCell cell = cell(text, font(FONT_BODY, Font.BOLD, highlighted ? COLOR_WHITE : COLOR_TEXTO_SECUNDARIO), Element.ALIGN_LEFT, Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setBackgroundColor(highlighted ? COLOR_AZUL_FLUIDO : COLOR_FONDO_SUAVE);
        cell.setPadding(7);
        return cell;
    }

    private PdfPCell totalValueCell(String text, boolean highlighted) {
        PdfPCell cell = cell(text, font(FONT_BODY, Font.BOLD, highlighted ? COLOR_WHITE : COLOR_TEXTO), Element.ALIGN_RIGHT, Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setBackgroundColor(highlighted ? COLOR_AZUL_FLUIDO : COLOR_WHITE);
        cell.setPadding(7);
        return cell;
    }

    private PdfPCell contentCell(PdfPTable table) {
        PdfPCell cell = new PdfPCell(table);
        cell.setBorder(Rectangle.BOX);
        cell.setBorderColor(COLOR_BORDE);
        cell.setPadding(0);
        return cell;
    }

    private PdfPCell borderless(String text) {
        return cell(text, bodyFont(), Element.ALIGN_LEFT, Rectangle.NO_BORDER);
    }

    private PdfPCell cell(String text, Font font, int alignment, int border) {
        return cell(new Phrase(dash(text), font), alignment, border);
    }

    private PdfPCell cell(Phrase phrase, int alignment, int border) {
        PdfPCell cell = new PdfPCell(phrase);
        cell.setHorizontalAlignment(alignment);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.setBorder(border);
        return cell;
    }

    private PdfPCell cell(Paragraph paragraph, int alignment, int border) {
        PdfPCell cell = new PdfPCell();
        cell.addElement(paragraph);
        cell.setHorizontalAlignment(alignment);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.setBorder(border);
        cell.setBorderColor(COLOR_BORDE);
        cell.setPadding(8);
        return cell;
    }

    private Image loadLogo() throws IOException {
        ClassPathResource resource = new ClassPathResource(LOGO_PATH);
        if (!resource.exists()) {
            return null;
        }
        URL url = resource.getURL();
        return Image.getInstance(url);
    }

    private void addSpacer(Document document, float height) throws DocumentException {
        Paragraph paragraph = new Paragraph(" ");
        paragraph.setLeading(height);
        document.add(paragraph);
    }

    private Font titleFont(int size, Color color) {
        return font(size, Font.BOLD, color);
    }

    private Font sectionFont() {
        return font(FONT_SECTION, Font.BOLD, COLOR_AZUL_FLUIDO);
    }

    private Font bodyFont() {
        return font(FONT_BODY, Font.NORMAL, COLOR_TEXTO);
    }

    private Font smallFont() {
        return font(FONT_SMALL, Font.NORMAL, COLOR_TEXTO_SECUNDARIO);
    }

    private Font font(int size, int style, Color color) {
        return new Font(Font.HELVETICA, size, style, color);
    }

    private Path resolvePdfPath(String pdfPath) {
        String fileName = pdfPath.replace("\\", "/");
        int slash = fileName.lastIndexOf('/');
        if (slash >= 0) {
            fileName = fileName.substring(slash + 1);
        }
        return storageDir.resolve(fileName).normalize();
    }

    private ContactoCliente findContact(Cotizacion cotizacion) {
        if (cotizacion == null || cotizacion.cliente == null || cotizacion.cliente.idCliente == null) {
            return null;
        }
        return contactoRepository.findByClienteIdCliente(cotizacion.cliente.idCliente).stream().findFirst().orElse(null);
    }

    private String cotizacionNumber(Cotizacion cotizacion) {
        return "C001-" + String.format("%06d", cotizacion.idCotizacion);
    }

    private String estado(Cotizacion cotizacion) {
        return cotizacion.estadoCotizacion == null ? "-" : cotizacion.estadoCotizacion.descEstadoCotizacion;
    }

    private String location(Cotizacion cotizacion, Cliente cliente) {
        String direct = cotizacion == null ? null : cotizacion.depProvDis;
        if (direct != null && !direct.isBlank()) {
            return direct;
        }
        if (cliente == null) {
            return "-";
        }
        return joinNonBlank(" / ", cliente.departamento, cliente.provincia, cliente.distrito);
    }

    private String fullName(com.example.demo.model.Usuario usuario) {
        if (usuario == null) {
            return "-";
        }
        return dash(joinNonBlank(" ", usuario.nombres, usuario.apellidoPaterno, usuario.apellidoMaterno));
    }

    private String fullName(ContactoCliente contacto) {
        if (contacto == null) {
            return "-";
        }
        return dash(joinNonBlank(" ", contacto.nombre, contacto.apellidoPaterno, contacto.apellidoMaterno));
    }

    private String firstText(String first, String second) {
        return first != null && !first.isBlank() ? first : second;
    }

    private String joinNonBlank(String separator, String... values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            if (value == null || value.isBlank()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(separator);
            }
            builder.append(value.trim());
        }
        return builder.toString();
    }

    private String dash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private String formatDate(LocalDateTime value) {
        return value == null ? "-" : value.format(DATE);
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null ? "-" : value.format(DATE_TIME);
    }

    private String displayMoneda(String moneda) {
        String value = dash(moneda).toUpperCase(Locale.ROOT);
        return value + ("-".equals(value) ? "" : " (" + currencySymbol(moneda) + ")");
    }

    private String currencySymbol(String moneda) {
        if (moneda == null) {
            return "";
        }
        String value = moneda.toUpperCase(Locale.ROOT);
        if (value.contains("DOLAR") || value.contains("USD") || value.contains("US")) {
            return "US$";
        }
        if (value.contains("SOL") || value.contains("PEN")) {
            return "S/";
        }
        return moneda;
    }

    private String formatMoney(BigDecimal value) {
        return MONEY.format(money(value));
    }

    private BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal lineAmount(CotizacionDetalle detalle) {
        if (detalle == null || detalle.precioUni == null || detalle.cantidad == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return money(detalle.precioUni.multiply(BigDecimal.valueOf(detalle.cantidad)));
    }

    private String amountInWords(BigDecimal amount, String moneda) {
        return currencySymbol(moneda) + " " + formatMoney(amount) + " " + dash(moneda);
    }

    private static DecimalFormat moneyFormat() {
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.US);
        symbols.setGroupingSeparator(',');
        symbols.setDecimalSeparator('.');
        DecimalFormat format = new DecimalFormat("#,##0.00", symbols);
        format.setRoundingMode(RoundingMode.HALF_UP);
        return format;
    }

    private final class FooterEvent extends PdfPageEventHelper {
        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfPTable footer = new PdfPTable(new float[] {4f, 1.2f});
            footer.setTotalWidth(document.getPageSize().getWidth() - MARGIN_LEFT - MARGIN_RIGHT);
            footer.getDefaultCell().setBorder(Rectangle.NO_BORDER);

            PdfPCell message = cell(
                    "Documento generado por el sistema BIOFLUID D-32. " + formatDateTime(LocalDateTime.now()),
                    smallFont(),
                    Element.ALIGN_LEFT,
                    Rectangle.NO_BORDER);
            message.setBorderWidthTop(.4f);
            message.setBorderColor(COLOR_BORDE);
            message.setPaddingTop(6);
            footer.addCell(message);

            PdfPCell page = cell("Pagina " + writer.getPageNumber(), smallFont(), Element.ALIGN_RIGHT, Rectangle.NO_BORDER);
            page.setBorderWidthTop(.4f);
            page.setBorderColor(COLOR_BORDE);
            page.setPaddingTop(6);
            footer.addCell(page);

            footer.writeSelectedRows(0, -1, MARGIN_LEFT, MARGIN_BOTTOM - 6, writer.getDirectContent());
        }
    }
}
