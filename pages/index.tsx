'use client';

import { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';

// --- Tipagens (sem alterações) ---
type LoteAPI = {
  Codigo: string;
  Fabricacao: string;
  Vencimento: string;
  Quantidade: number;
};

type ItemAPI = {
  nrItem: number;
  codigo: string;
  valor: number;
  unidade: string;
  quantidade: number;
  lotes: LoteAPI[];
};

type LoteRaw = {
  codigo?: string;
  Codigo?: string;
  fabricacao?: string;
  Fabricacao?: string;
  vencimento?: string;
  Vencimento?: string;
  quantidade?: number | string;
  Quantidade?: number | string;
};

type ItemRaw = {
  nrItem?: number;
  NrItem?: number;
  codigo?: string;
  Codigo?: string;
  valor?: number | string;
  Valor?: number | string;
  unidade?: string;
  Unidade?: string;
  quantidade?: number | string;
  Quantidade?: number | string;
  lotes?: LoteRaw[];
  Lotes?: LoteRaw[];
};

type EstadoItem = {
  item: string;
  esperada: number;
  conferida: number;
  lote: string;
  ultimaAtualizacao?: number;
};

export default function Home() {
  const [documento, setDocumento] = useState('');
  const [numeroNFParaPDF, setNumeroNFParaPDF] = useState('');
  const [items, setItems] = useState<ItemAPI[]>([]);
  const [estado, setEstado] = useState<Record<string, EstadoItem>>({});

  const [loteBipado, setLoteBipado] = useState('');
  const [quantidadeBipada, setQuantidadeBipada] = useState('');
  const [loteParaConferencia, setLoteParaConferencia] = useState<string | null>(null);

  const loteInputRef = useRef<HTMLInputElement>(null);
  const quantidadeInputRef = useRef<HTMLInputElement>(null);
  const documentoInputRef = useRef<HTMLInputElement>(null);


  // --- AJUSTE DE FOCO COM useEffect ---

  // Efeito 1: Foca no input de QUANTIDADE quando um lote é selecionado.
  useEffect(() => {
    if (loteParaConferencia && quantidadeInputRef.current) {
      // Usamos um pequeno delay para garantir que o input esteja visível e pronto.
      const timer = setTimeout(() => {
        quantidadeInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [loteParaConferencia]);

  // Efeito 2: Foca no input de LOTE quando a página carrega ou um lote é finalizado.
  useEffect(() => {
    // A condição para focar no lote é: ter itens carregados, mas não estar no meio de uma conferência de lote.
    const deveFocarLote = items.length > 0 && loteParaConferencia === null;
    
    // Verificamos também se todos os itens já não foram conferidos.
    const todosConferidos = items.length > 0 && Object.values(estado).every(
        (reg) => reg.conferida >= reg.esperada
      );

    if (deveFocarLote && !todosConferidos) {
      const timer = setTimeout(() => {
        loteInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [items, loteParaConferencia, estado]); // Depende do estado para reavaliar quando a conferência termina.


  const tocarErro = () => {
    (document.getElementById('erro-audio') as HTMLAudioElement | null)?.play();
  };

  const buscarPedido = async () => {
    if (!documento.trim()) {
      alert('Informe o número do documento ou bipar a chave da NF.');
      tocarErro();
      return;
    }

    let documentoParaBuscar = documento.trim();
    let nfParaPDF = documento.trim();

    if (documentoParaBuscar.length === 44 && /^\d+$/.test(documentoParaBuscar)) {
      const nfNumberString = documentoParaBuscar.substring(25, 34);
      nfParaPDF = parseInt(nfNumberString, 10).toString();
      documentoParaBuscar = nfParaPDF;
    } else {
      nfParaPDF = documentoParaBuscar;
    }

    setNumeroNFParaPDF(nfParaPDF);

    try {
      const res = await fetch(
        `https://api.maglog.com.br/api-wms/rest/1/event/expedicao?Documento=${documentoParaBuscar}`,
        {
          headers: {
            Tenant: 'F8A63EBF-A4C5-457D-9482-2D6381318B8E',
            Owner: '0157A619-B0CF-4327-82B2-E4084DBAC7DD',
          },
        }
      );
      const data = await res.json();
      const apiItens: ItemRaw[] = data.itens;

      if (!Array.isArray(apiItens) || apiItens.length === 0) {
        alert('Pedido não encontrado ou sem itens.');
        tocarErro();
        setItems([]);
        return;
      }

      const mapped: ItemAPI[] = apiItens.map((i: ItemRaw) => ({
        nrItem: i.nrItem ?? i.NrItem ?? 0,
        codigo: i.codigo ?? i.Codigo ?? '',
        valor: Number(i.valor ?? i.Valor ?? 0),
        unidade: i.unidade ?? i.Unidade ?? '',
        quantidade: Number(i.quantidade ?? i.Quantidade ?? 0),
        lotes: Array.isArray(i.lotes ?? i.Lotes)
          ? (i.lotes ?? i.Lotes)!.map((l: LoteRaw) => ({
              Codigo: String(l.codigo ?? l.Codigo ?? ''),
              Fabricacao: l.fabricacao ?? l.Fabricacao ?? '',
              Vencimento: l.vencimento ?? l.Vencimento ?? '',
              Quantidade: Number(l.quantidade ?? l.Quantidade ?? 0),
            }))
          : [],
      }));

      setItems(mapped);

      const init: Record<string, EstadoItem> = {};
      let idx = 0;
      mapped.forEach(i => {
        if (i.lotes.length > 0) {
          i.lotes.forEach(l => {
            for (let q = 0; q < l.Quantidade; q++) {
              const key = `${l.Codigo}-${idx++}`;
              init[key] = { item: i.codigo, lote: l.Codigo, esperada: 1, conferida: 0 };
            }
          });
        } else {
          for (let q = 0; q < i.quantidade; q++) {
            const key = `${i.codigo}-${idx++}`;
            init[key] = { item: i.codigo, lote: i.codigo, esperada: 1, conferida: 0 };
          }
        }
      });
      setEstado(init);

      // A chamada de foco foi REMOVIDA daqui e transferida para o useEffect.

    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      alert('Erro na requisição da API.');
      tocarErro();
    }
  };

  const processarLote = (entrada: string) => {
    const loteDigitado = entrada.trim();
    if (!loteDigitado) return;

    const loteValido = Object.values(estado).some(
      reg => reg.lote === loteDigitado && reg.conferida < reg.esperada
    );

    if (loteValido) {
      setLoteParaConferencia(loteDigitado);
      setLoteBipado(loteDigitado);
    } else {
      alert('Lote inválido ou já totalmente conferido.');
      tocarErro();
      setLoteBipado('');
    }
  };

  const processarConferencia = async () => {
    const quantidade = parseInt(quantidadeBipada, 10);

    if (!loteParaConferencia || isNaN(quantidade) || quantidade <= 0) {
        alert('Por favor, insira uma quantidade válida.');
        tocarErro();
        setQuantidadeBipada('');
        return;
    }

    const chavesPendentes = Object.keys(estado).filter(
        key => estado[key].lote === loteParaConferencia && estado[key].conferida < estado[key].esperada
    );

    if (chavesPendentes.length < quantidade) {
        alert(`Quantidade a conferir (${quantidade}) é maior que a pendente (${chavesPendentes.length}).`);
        tocarErro();
        setQuantidadeBipada('');
        return;
    }

    const chavesParaAtualizar = chavesPendentes.slice(0, quantidade);
    await atualizarConferencia(chavesParaAtualizar);

    const pendentesAposUpdate = chavesPendentes.length - quantidade;

    if (pendentesAposUpdate > 0) {
        setQuantidadeBipada('');
    } else {
        setLoteBipado('');
        setQuantidadeBipada('');
        setLoteParaConferencia(null);
        // A chamada de foco foi REMOVIDA daqui e transferida para o useEffect.
    }
  };

  const atualizarConferencia = async (chaves: string[]) => {
      const timestamp = Date.now();
      
      setEstado(prevEstado => {
        const novoEstado = { ...prevEstado };
        chaves.forEach(chave => {
            const reg = novoEstado[chave];
            if (reg) {
                novoEstado[chave] = {
                    ...reg,
                    conferida: reg.conferida + 1,
                    ultimaAtualizacao: timestamp,
                };
            }
        });
        return novoEstado;
      });
  
      const regBase = estado[chaves[0]];
      
      await supabase.from('conferencias').insert({
          documento,
          codigo_item: regBase.item,
          lote: regBase.lote,
          quantidade_esperada: chaves.length, 
          quantidade_conferida: chaves.length,
          data: new Date().toISOString(),
      });
  };

  // Restante do código (finalizarConferencia, JSX, etc.) permanece o mesmo...
  const finalizarConferencia = () => {
    const todosConferidos = Object.values(estado).every(
      reg => reg.conferida >= reg.esperada
    );

    if (!todosConferidos) {
      alert('Ainda existem itens pendentes de conferência.');
      tocarErro();
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const img = new window.Image();
    img.src = '/logo.png';

    img.onload = () => {
      doc.addImage(img, 'PNG', 85, 10, 40, 15);
      doc.setFontSize(12);
      doc.text(`Conferência Documento: ${numeroNFParaPDF}`, 16, 30);

      const agrupado: Record<string, { item: string; lote: string; esperada: number; conferida: number }> = {};
      Object.entries(estado).forEach(([, reg]) => {
        const id = `${reg.item}-${reg.lote}`;
        if (!agrupado[id]) agrupado[id] = { item: reg.item, lote: reg.lote, esperada: 0, conferida: 0 };
        agrupado[id].esperada += reg.esperada;
        agrupado[id].conferida += reg.conferida;
      });

      const body: string[][] = Object.values(agrupado).map(reg => [
        reg.item,
        reg.lote,
        reg.esperada.toString(),
      ]);

      autoTable(doc, {
        head: [['Código', 'Lote', 'Quantidade']],
        body,
        startY: 32,
        headStyles: { fillColor: [52, 152, 219], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [250, 250, 250], textColor: [50, 50, 50] },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        styles: { fontSize: 10, halign: 'center' },
        tableWidth: 'auto',
      });

      doc.save(`conferencia_${numeroNFParaPDF}.pdf`);
      alert('Conferência realizada com sucesso!');
    };
  };

  const agrupadoMap = Object.entries(estado).reduce((acc, [, reg]) => {
    const id = `${reg.item}-${reg.lote}`;
    if (!acc[id]) {
      acc[id] = {
        item: reg.item,
        lote: reg.lote,
        esperada: 0,
        conferida: 0,
        bipado: false,
        ultimaAtualizacao: 0,
      };
    }
    acc[id].esperada += reg.esperada;
    acc[id].conferida += reg.conferida;
    if (reg.conferida > 0) {
      acc[id].bipado = true;
      acc[id].ultimaAtualizacao = Math.max(acc[id].ultimaAtualizacao, reg.ultimaAtualizacao ?? 0);
    }
    return acc;
  }, {} as Record<string, { item: string; lote: string; esperada: number; conferida: number; bipado: boolean; ultimaAtualizacao: number }>);

  const agrupado = Object.values(agrupadoMap);

  agrupado.sort((a, b) => {
    const statusA = a.bipado ? (a.conferida >= a.esperada ? 1 : 0) : 2;
    const statusB = b.bipado ? (b.conferida >= b.esperada ? 1 : 0) : 2;

    if (statusA !== statusB) return statusA - statusB;
    if (statusA === 0) return (b.ultimaAtualizacao ?? 0) - (a.ultimaAtualizacao ?? 0);
    return 0;
  });

  const todosConferidos = Object.values(estado).length > 0 && Object.values(estado).every(
    (reg) => reg.conferida >= reg.esperada
  );

  return (
    <main className="container">
      <audio id="erro-audio" src="/erro.mp3" preload="auto"></audio>

      <div style={{ textAlign: 'center' }}>
        <Image src="/logo.png" alt="Logo da Empresa" width={150} height={50} style={{ marginBottom: '1.5rem' }} />
      </div>

      <h1>Conferência de Pedidos - {numeroNFParaPDF}</h1>

      <div className="form">
        <input
          ref={documentoInputRef}
          value={documento}
          onChange={e => setDocumento(e.target.value)}
          placeholder="Número do Documento ou Chave da NF"
          onKeyDown={e => e.key === 'Enter' && buscarPedido()}
          disabled={items.length > 0}
        />
        <button onClick={buscarPedido} disabled={items.length > 0}>Buscar</button>
      </div>

      {items.length > 0 && (
        <>
          <div className="form-conferencia">
            <div className="input-group">
                <label htmlFor="lote-input">Lote</label>
                <input
                    id='lote-input'
                    ref={loteInputRef}
                    placeholder="Bipe o lote"
                    value={loteBipado}
                    onChange={e => setLoteBipado(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && processarLote(loteBipado)}
                    disabled={!!loteParaConferencia} 
                />
            </div>

            {loteParaConferencia && (
              <div className="input-group">
                <label htmlFor="quantidade-input">Quantidade</label>
                <input
                    id='quantidade-input'
                    ref={quantidadeInputRef}
                    placeholder="Bipe a Qtde"
                    type="number"
                    value={quantidadeBipada}
                    onChange={e => setQuantidadeBipada(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && processarConferencia()}
                />
              </div>
            )}
          </div>

          <table className="styled-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Lote</th>
                <th>Esperada</th>
                <th>Conferida</th>
              </tr>
            </thead>
            <tbody>
              {agrupado.map((reg, idx) => (
                <tr
                  key={idx}
                  className={
                    reg.bipado && reg.conferida < reg.esperada
                      ? 'pendente'
                      : reg.conferida >= reg.esperada
                      ? 'ok'
                      : ''
                  }
                >
                  <td>{reg.item}</td>
                  <td>{reg.lote}</td>
                  <td>{reg.esperada}</td>
                  <td>{reg.conferida} / {reg.esperada}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!todosConferidos && (
            <p style={{ color: 'red', marginTop: '1rem' }}>Ainda há itens pendentes de conferência.</p>
          )}

          {todosConferidos && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.6rem' }}>
              <button onClick={finalizarConferencia}>Finalizar e Gerar PDF</button>
            </div>
          )}
        </>
      )}
    </main>
  );
}