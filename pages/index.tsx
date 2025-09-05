'use client';

import { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';
import Script from 'next/script'; // 1. IMPORTAR O SCRIPT

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

const CLIENTES = [
    { nome: 'Endress + Hauser', id: '0157A619-B0CF-4327-82B2-E4084DBAC7DD' },
    { nome: 'Um Grau e Meio', id: '8A697099-E130-4A57-BE47-DD8B72E3C003' },
];


export default function Home() {
  const [clienteSelecionado, setClienteSelecionado] = useState(CLIENTES[0].id);
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

  useEffect(() => {
    if (loteParaConferencia && quantidadeInputRef.current) {
      const timer = setTimeout(() => {
        quantidadeInputRef.current?.focus();
      }, 0);

      const rowId = `row-${loteParaConferencia}`;
      const rowElement = document.getElementById(rowId);
      
      if (rowElement) {
        rowElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
      
      return () => clearTimeout(timer);
    }
  }, [loteParaConferencia]);

  useEffect(() => {
    const deveFocarLote = items.length > 0 && loteParaConferencia === null;
    const todosConferidos = items.length > 0 && Object.values(estado).every(
      (reg) => reg.conferida >= reg.esperada
    );
    if (deveFocarLote && !todosConferidos) {
      const timer = setTimeout(() => {
        loteInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [items, loteParaConferencia, estado]);

  useEffect(() => {
      if (items.length === 0 && documentoInputRef.current) {
          const timer = setTimeout(() => {
              documentoInputRef.current?.focus();
          }, 0);
          return () => clearTimeout(timer);
      }
  }, [items]);

  const tocarErro = () => {
    (document.getElementById('erro-audio') as HTMLAudioElement | null)?.play();
  };

  const buscarPedido = async () => {
    if (!clienteSelecionado) {
        alert('Por favor, selecione um cliente.');
        tocarErro();
        return;
    }
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
            Owner: clienteSelecionado,
          },
        }
      );
      const data = await res.json();
      const apiItens: ItemRaw[] = data.itens;
      if (!Array.isArray(apiItens) || apiItens.length === 0) {
        alert('Pedido não encontrado ou sem itens para o cliente selecionado.');
        tocarErro();
        setItems([]);
        return;
      }

      const mapped: ItemAPI[] = apiItens.map((i: ItemRaw) => ({
        nrItem: i.nrItem ?? i.NrItem ?? 0,
        codigo: (i.codigo ?? i.Codigo ?? '').trim(),
        valor: Number(i.valor ?? i.Valor ?? 0),
        unidade: i.unidade ?? i.Unidade ?? '',
        quantidade: Number(i.quantidade ?? i.Quantidade ?? 0),
        lotes: Array.isArray(i.lotes ?? i.Lotes)
          ? (i.lotes ?? i.Lotes)!.map((l: LoteRaw) => ({
              Codigo: String(l.codigo ?? l.Codigo ?? '').trim(),
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
    } catch (err) {
      console.error('Erro ao buscar pedido:', err);
      alert('Erro na requisição da API.');
      tocarErro();
    }
  };

  const processarLote = (entrada: string) => {
    const valorBipado = entrada.trim();
    if (!valorBipado) return;

    const loteDiretoPendente = Object.values(estado).find(
      (reg) => reg.lote === valorBipado && reg.conferida < reg.esperada
    );

    if (loteDiretoPendente) {
      setLoteParaConferencia(valorBipado);
      setLoteBipado(valorBipado);
      return;
    }

    const registrosDoItem = Object.values(estado).filter(
      (reg) => reg.item === valorBipado && reg.conferida < reg.esperada
    );

    if (registrosDoItem.length > 0) {
      const lotesPendentes = [...new Set(registrosDoItem.map((reg) => reg.lote))];
      if (lotesPendentes.length === 1) {
        const loteUnico = lotesPendentes[0];
        setLoteParaConferencia(loteUnico);
        setLoteBipado(valorBipado);
        return;
      } else {
        alert(
          `Este item possui múltiplos lotes pendentes (${lotesPendentes.join(
            ', '
          )}). Por favor, bipe o código de um dos lotes.`
        );
        tocarErro();
        setLoteBipado('');
        return;
      }
    }

    alert('Item ou Lote inválido, não encontrado no pedido ou já totalmente conferido.');
    tocarErro();
    setLoteBipado('');
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
          owner: clienteSelecionado,
          quantidade_esperada: chaves.length, 
          quantidade_conferida: chaves.length,
          data: new Date().toISOString(),
      });
  };

  const resetarAplicacao = () => {
      setDocumento('');
      setNumeroNFParaPDF('');
      setItems([]);
      setEstado({});
      setLoteBipado('');
      setQuantidadeBipada('');
      setLoteParaConferencia(null);
  };

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
      const nomeCliente = CLIENTES.find(c => c.id === clienteSelecionado)?.nome || 'Cliente não encontrado';
      doc.addImage(img, 'PNG', 85, 10, 50, 15);
      doc.setFontSize(12);
      doc.text(`Conferência Documento: ${numeroNFParaPDF}`, 16, 30);
      doc.text(`Cliente: ${nomeCliente}`, 16, 35);
      
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
        startY: 40,
        headStyles: { fillColor: [0, 128, 128], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { fillColor: [250, 250, 250], textColor: [50, 50, 50] },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        styles: { fontSize: 10, halign: 'center' },
        tableWidth: 'auto',
      });
      
      doc.save(`conferencia_${numeroNFParaPDF}.pdf`);
      alert('Conferência realizada com sucesso!');
      resetarAplicacao();
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

  const totalEsperado = Object.values(estado).length;
  const totalConferido = Object.values(estado).filter(reg => reg.conferida >= reg.esperada).length;

  return (
    <main className="layout-container">
      <audio id="erro-audio" src="/erro.mp3" preload="auto"></audio>

      <div className="layout-header">
        <div className="header-content-wrapper">
          <div className="logo-container">
            <Image src="/logo.png" alt="Logo da Empresa" width={130} height={41} />
          </div>
          <h1>{numeroNFParaPDF ? `NF: ${numeroNFParaPDF}` : 'Conferência de Pedidos'}</h1>
          
          <div className="input-group">
            <label htmlFor="cliente-select">Cliente</label>
            <select
                id="cliente-select"
                value={clienteSelecionado}
                onChange={e => setClienteSelecionado(e.target.value)}
                disabled={items.length > 0}
                style={{ borderRadius: '5px' }}
            >
                {CLIENTES.map(cliente => (
                    <option key={cliente.id} value={cliente.id}>
                        {cliente.nome}
                    </option>
                ))}
            </select>
          </div>
        
          <div className="input-group" >
            <label htmlFor="documento-input">Documento</label>
            <input
              id="documento-input"
              ref={documentoInputRef}
              value={documento}
              onChange={e => setDocumento(e.target.value)}
              placeholder="Nº ou Chave da NF"
              onKeyDown={e => e.key === 'Enter' && buscarPedido()}
              disabled={items.length > 0}
              style={{ borderRadius: '5px' }}
            />
          </div>
          <button onClick={buscarPedido} disabled={items.length > 0} style={{ borderRadius: '5px', marginTop: '0rem' }}>Buscar</button>

          {items.length > 0 && (
            <>
              <div className="input-group">
                <label htmlFor="lote-input">Item / Lote</label>
                <input
                    id='lote-input'
                    ref={loteInputRef}
                    placeholder="Bipe o Item ou Lote"
                    value={loteBipado}
                    onChange={e => setLoteBipado(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && processarLote(loteBipado)}
                    disabled={!!loteParaConferencia || todosConferidos}
                />
              </div>

              {loteParaConferencia && (
                <div className="input-group">
                  <label htmlFor="quantidade-input">Qtde</label>
                  <input
                      id='quantidade-input'
                      ref={quantidadeInputRef}
                      placeholder="Qtde"
                      type="number"
                      value={quantidadeBipada}
                      onChange={e => setQuantidadeBipada(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && processarConferencia()}
                  />
                </div>
              )}
            </>
          )}

          <div className="spacer"></div>

          {items.length > 0 && (
            <div className="conference-counter">
              <span className="counter-label">Status:</span>
              <span className="counter-numbers">{totalConferido} / {totalEsperado}</span>
            </div>
          )}

          {/* 2. ADICIONAR O BOTÃO DE TEMA */}
          <button id="theme-toggle" aria-label="Alternar tema"></button>
        </div>
      </div>

      <div className="layout-content">
        {items.length > 0 ? (
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
              {agrupado.map((reg) => {
                const classNames = [];
                if (loteParaConferencia === reg.lote) {
                  classNames.push('focused');
                }
                
                if (reg.conferida >= reg.esperada) {
                  classNames.push('ok');
                } else if (reg.bipado && reg.conferida < reg.esperada) {
                  classNames.push('pendente');
                }

                return (
                  <tr
                    id={`row-${reg.lote}`}
                    key={`${reg.item}-${reg.lote}`}
                    className={classNames.join(' ')}
                  >
                    <td>{reg.item}</td>
                    <td>{reg.lote}</td>
                    <td>{reg.esperada}</td>
                    <td>{reg.conferida} / {reg.esperada}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{textAlign: 'center', color: '#888', marginTop: '4rem'}}>
            <p>Aguardando a busca de um documento para iniciar a conferência.</p>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="layout-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          {!todosConferidos && (
            <p style={{ color: 'red', margin: '0' }}>Ainda há itens pendentes de conferência.</p>
          )}
          {todosConferidos && (
            <button onClick={finalizarConferencia} style={{ borderRadius: '5px', margin: '0rem' }}>Finalizar Conferência</button>
          )}
        </div>
      )}
      <Script src="/scripts/theme-switcher.js" strategy="lazyOnload" />
    </main>
  );
}