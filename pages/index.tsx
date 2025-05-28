'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';

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

export default function Home() {
  const [documento, setDocumento] = useState('');
  const [items, setItems] = useState<ItemAPI[]>([]);
  const [estado, setEstado] = useState<
    Record<string, { item: string; esperada: number; conferida: number }>
  >({});
  const [bip, setBip] = useState('');

  const tocarErro = () => {
    (document.getElementById('erro-audio') as HTMLAudioElement | null)?.play();
  };

  const buscarPedido = async () => {
    if (!documento.trim()) {
      alert('Informe o número do documento');
      tocarErro();
      return;
    }
    try {
      const res = await fetch(
        `https://api.maglog.com.br/api-wms/rest/1/event/expedicao?Documento=${documento}`,
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
              Codigo: l.codigo ?? l.Codigo ?? '',
              Fabricacao: l.fabricacao ?? l.Fabricacao ?? '',
              Vencimento: l.vencimento ?? l.Vencimento ?? '',
              Quantidade: Number(l.quantidade ?? l.Quantidade ?? 0),
            }))
          : [],
      }));

      setItems(mapped);

      const init: Record<string, { item: string; esperada: number; conferida: number }> = {};
      let idx = 0;
      mapped.forEach(i => {
        if (i.lotes.length > 0) {
          i.lotes.forEach(l => {
            for (let q = 0; q < l.Quantidade; q++) {
              const key = `${l.Codigo}-${idx++}`;
              init[key] = { item: i.codigo, esperada: 1, conferida: 0 };
            }
          });
        } else {
          for (let q = 0; q < i.quantidade; q++) {
            const key = `${i.codigo}-${idx++}`;
            init[key] = { item: i.codigo, esperada: 1, conferida: 0 };
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

const processarBip = async (entrada: string) => {
  const chave = entrada.trim();
  if (!chave) return;

  const chavesPossiveis = Object.keys(estado).filter(k => k.split('-')[0] === chave);
  const chaveLivre = chavesPossiveis.find(k => estado[k].conferida < estado[k].esperada);

  if (chaveLivre) {
    await atualizarConferencia(chaveLivre);
  } else {
    alert('Todos os registros desse código/lote já foram conferidos.');
    tocarErro();
  }
  setBip('');
};


  const atualizarConferencia = async (chave: string) => {
    const reg = estado[chave];
    if (!reg) {
      alert('Chave inválida.');
      tocarErro();
      return;
    }
    if (reg.conferida >= reg.esperada) {
      alert('Quantidade já conferida.');
      tocarErro();
      return;
    }

    const novo = { ...reg, conferida: reg.conferida + 1 };
    setEstado(prev => ({ ...prev, [chave]: novo }));

    await supabase.from('conferencias').insert({
      documento,
      codigo_item: reg.item,
      lote: chave.split('-')[0],
      quantidade_esperada: reg.esperada,
      quantidade_conferida: novo.conferida,
      data: new Date().toISOString(),
    });
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

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [100, 150],
    });

    const img = new Image();
    img.src = '/logo.png';

    img.onload = () => {
      doc.addImage(img, 'PNG', 10, 10, 25, 10);
      doc.setFontSize(12);
      doc.text(`Conferência Documento: ${documento}`, 10, 30);

      const agrupado: Record<string, { item: string; lote: string; esperada: number; conferida: number }> = {};
      Object.entries(estado).forEach(([key, reg]) => {
        const lote = key.split('-')[0];
        const id = `${reg.item}-${lote}`;
        if (!agrupado[id]) {
          agrupado[id] = { item: reg.item, lote, esperada: 0, conferida: 0 };
        }
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
        headStyles: {
          fillColor: [52, 152, 219],
          textColor: 255,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fillColor: [250, 250, 250],
          textColor: [50, 50, 50],
        },
        alternateRowStyles: {
          fillColor: [240, 240, 240],
        },
        styles: {
          fontSize: 10,
          halign: 'center',
        },
      });

      doc.save(`conferencia_${documento}.pdf`);
      alert('Conferência realizada com sucesso!');
    };
  };

  const agrupado = Object.values(
    Object.entries(estado).reduce((acc, [key, reg]) => {
      const lote = key.split('-')[0];
      const id = `${reg.item}-${lote}`;
      if (!acc[id]) {
        acc[id] = { item: reg.item, lote, esperada: 0, conferida: 0 };
      }
      acc[id].esperada += reg.esperada;
      acc[id].conferida += reg.conferida;
      return acc;
    }, {} as Record<string, { item: string; lote: string; esperada: number; conferida: number }>),
  );

  const todosConferidos = agrupado.every(reg => reg.conferida >= reg.esperada);

  return (
    <main className="container">
      <audio id="erro-audio" src="/erro.mp3" preload="auto"></audio>

      <img
        src="/logo.png"
        alt="Logo da Empresa"
        style={{
          width: '150px',
          marginBottom: '1.5rem',
          display: 'block',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      />
      <h1>Conferência de Pedidos</h1>

      <div className="form">
        <input
          value={documento}
          onChange={e => setDocumento(e.target.value)}
          placeholder="Número do Documento"
        />
        <button onClick={buscarPedido}>Buscar</button>
      </div>

      {items.length > 0 && (
        <>
          <div className="form">
            <input
              placeholder="Bipe código ou lote"
              value={bip}
              onChange={e => setBip(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && processarBip(bip)}
            />
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
                  className={reg.conferida >= reg.esperada ? 'ok' : 'pendente'}
                >
                  <td>{reg.item}</td>
                  <td>{reg.lote}</td>
                  <td>{reg.esperada}</td>
                  <td>{`${reg.conferida} / ${reg.esperada}`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="btn-finalizar"
            onClick={finalizarConferencia}
            disabled={!todosConferidos}
          >
            Finalizar Conferência
          </button>
        </>
      )}
    </main>
  );
}
