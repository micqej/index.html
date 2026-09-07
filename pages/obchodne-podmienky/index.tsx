import Nav from '../../components/Nav'
import Footer from '../../components/Footer'
import SEO from '../../components/SEO'
import { SITE_URL } from '../../lib/site'

export default function ObchodnePodmienky() {
  return (
    <>
      <SEO title="Obchodné podmienky" description="Obchodné podmienky spoločnosti Brandrise s.r.o. — Monetico agentúra." canonical={`${SITE_URL}/obchodne-podmienky/`} />
      <Nav />
      <div style={{ padding: '140px 48px 100px', maxWidth: '860px' }}>
        <div className="section-label">Právne informácie</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(40px,6vw,80px)', letterSpacing: '-3px', lineHeight: '0.95', marginBottom: '60px' }}>
          OBCHODNÉ<br />PODMIENKY
        </h1>
        <div className="article-body">
          <h2>1. Základné ustanovenia</h2>
          <p>Tieto všeobecné obchodné podmienky (ďalej len „VOP") upravujú zmluvné vzťahy medzi spoločnosťou <strong>Brandrise s.r.o.</strong>, so sídlom Sokolovská 178/10, 040 11 Košice, IČO: 53196449 (ďalej len „poskytovateľ") a klientom.</p>
          <p>Poskytovateľ je platiteľom DPH (IČ DPH: SK2121313865).</p>

          <h2>2. Predmet zmluvy</h2>
          <p>Predmetom zmluvy je poskytovanie digitálnych marketingových služieb, najmä: cold email kampane, SEO optimalizácia, správa sociálnych sietí, email marketing, tvorba webových stránok a e-shopov, správa PPC reklamy.</p>

          <h2>3. Uzatvorenie zmluvy</h2>
          <p>Zmluva medzi poskytovateľom a klientom sa považuje za uzatvorenú momentom potvrdenia objednávky e-mailom alebo podpisom zmluvy o spolupráci. Pred uzatvorením zmluvy je klientovi poskytnutý cenník a rozsah služieb.</p>

          <h2>4. Platobné podmienky</h2>
          <p>Ceny sú uvedené bez DPH, ak nie je uvedené inak. Faktúry sú splatné do 14 dní od vystavenia. Pri mesačných službách je platba splatná vopred na začiatku každého mesiaca. Jednorazové platby (nastavenie, audit) sú splatné pred začatím práce.</p>
          <p>V prípade omeškania platby má poskytovateľ právo pozastaviť poskytovanie služieb.</p>

          <h2>5. Práva a povinnosti poskytovateľa</h2>
          <p>Poskytovateľ sa zaväzuje poskytovať dohodnuté služby s odbornou starostlivosťou, v dohodnutom rozsahu a termínoch. Poskytovateľ negarantuje konkrétne výsledky (napr. počet konverzií, pozície vo vyhľadávačoch), nakoľko tieto závisia od externých faktorov.</p>

          <h2>6. Termíny dodania, garancia a plánovaná dovolenka</h2>
          <p>Dohodnuté termíny dodania plynú od dodania kompletných podkladov klientom, nie od potvrdenia objednávky. Ak je pri konkrétnej službe uvedená garancia dodania (napríklad dodanie do 14 dní alebo garancia vrátenia peňazí pri nedodržaní termínu), platí v plnom rozsahu s jedinou výnimkou uvedenou nižšie.</p>
          <p><strong>Plánovaná firemná dovolenka.</strong> Poskytovateľ čerpá raz ročne súvislú firemnú dovolenku v dĺžke najviac 14 kalendárnych dní. Ak sa toto obdobie prekrýva s dohodnutým termínom dodania, dodacia lehota počas dovolenky neplynie a dohodnutý termín sa predlžuje o rovnaký počet dní. O rovnaký počet dní sa posúva aj lehota, na ktorú sa viaže garancia dodania, a nárok na vrátenie ceny z dôvodu tohto posunu klientovi nevzniká.</p>
          <p>Poskytovateľ oznámi klientovi termín dovolenky najmenej 7 dní pred jej začiatkom, a to e-mailom alebo prostredníctvom klientskeho portálu. Ak je zákazku možné dokončiť ešte pred začiatkom dovolenky, poskytovateľ ju dodá v pôvodnom termíne. Dokončenie zákazky nie je dovolenkou nijako dotknuté, posúva sa len termín dodania.</p>

          <h2>7. Práva a povinnosti klienta</h2>
          <p>Klient sa zaväzuje poskytnúť potrebnú súčinnosť, podklady a prístupy potrebné na výkon dohodnutých služieb, a to v dohodnutých termínoch. Klient je zodpovedný za pravdivosť a správnosť poskytnutých podkladov.</p>

          <h2>8. Ochrana dôverných informácií</h2>
          <p>Obe zmluvné strany sa zaväzujú zachovávať mlčanlivosť o všetkých dôverných informáciách získaných v súvislosti so spoluprácou. Táto povinnosť trvá aj po ukončení zmluvného vzťahu.</p>

          <h2>9. Zodpovednosť za škody</h2>
          <p>Poskytovateľ nezodpovedá za škody spôsobené vyššou mocou, nedostatočnou súčinnosťou klienta alebo zásahmi tretích strán (napr. zmeny algoritmov vyhľadávačov, výpadky platforiem).</p>

          <h2>10. Ukončenie zmluvy</h2>
          <p>Klient môže ukončiť mesačné služby výpoveďou s 30-dňovou výpovednou lehotou, a to písomne na e-mail info@monetico.sk. Jednorazové platby za nastavenie a analýzy sú nevratné.</p>

          <h2>11. Záverečné ustanovenia</h2>
          <p>Tieto VOP sa riadia právnym poriadkom Slovenskej republiky. Prípadné spory budú riešené dohodou, prípadne príslušným súdom v SR. Poskytovateľ si vyhradzuje právo tieto VOP meniť — aktuálna verzia je vždy na tejto stránke.</p>
          <p>Posledná aktualizácia: september 2026.</p>
        </div>
      </div>
      <Footer />
    </>
  )
}
