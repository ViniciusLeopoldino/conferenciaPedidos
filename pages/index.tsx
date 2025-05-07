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

export default function Home() {
  const [documento, setDocumento] = useState('');
  const [items, setItems] = useState<ItemAPI[]>([]);
  const [estado, setEstado] = useState<
    Record<string, { item: string; esperada: number; conferida: number }>
  >({});
  const [bip, setBip] = useState('');

  const buscarPedido = async () => {
    if (!documento.trim()) return alert('Informe o número do documento');
    try {
      const res = await fetch(
        `https://api.maglog.com.br/api-wms.hom/rest/1/event/expedicao?Documento=${documento}`,
        {
          headers: {
            Tenant: 'F8A63EBF-A4C5-457D-9482-2D6381318B8E',
            Owner: '0157A619-B0CF-4327-82B2-E4084DBAC7DD',
          },
        }
      );
      const data = await res.json();
      const apiItens = data.itens;

      if (!Array.isArray(apiItens) || apiItens.length === 0) {
        alert('Pedido não encontrado ou sem itens.');
        setItems([]);
        return;
      }

      const mapped: ItemAPI[] = apiItens.map((i: any) => ({
        nrItem: i.nrItem ?? i.NrItem,
        codigo: i.codigo ?? i.Codigo,
        valor: Number(i.valor ?? i.Valor),
        unidade: i.unidade ?? i.Unidade,
        quantidade: Number(i.quantidade ?? i.Quantidade),
        lotes: Array.isArray(i.lotes ?? i.Lotes)
          ? (i.lotes ?? i.Lotes).map((l: any) => ({
              Codigo: l.codigo ?? l.Codigo,
              Fabricacao: l.fabricacao ?? l.Fabricacao,
              Vencimento: l.vencimento ?? l.Vencimento,
              Quantidade: Number(l.quantidade ?? l.Quantidade),
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
    }
  };

  const processarBip = async (entrada: string) => {
    const chave = entrada.trim();
    if (!chave) return;

    const chavesPossiveis = Object.keys(estado).filter(k => k.startsWith(chave));
    const chaveLivre = chavesPossiveis.find(k => estado[k].conferida < estado[k].esperada);

    if (chaveLivre) {
      await atualizarConferencia(chaveLivre);
    } else {
      alert('Todos os registros desse código/lote já foram conferidos.');
    }
    setBip('');
  };

  const atualizarConferencia = async (chave: string) => {
    const reg = estado[chave];
    if (!reg) return alert('Chave inválida.');
    if (reg.conferida >= reg.esperada) return alert('Quantidade já conferida.');

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

  const todosConferidos = Object.values(estado).every(
    reg => reg.conferida >= reg.esperada
  );

  const finalizarConferencia = () => {
    if (!todosConferidos) {
      alert('Ainda existem itens pendentes de conferência.');
      return;
    }

    const doc = new jsPDF();
    doc.text(`Conferência Documento: ${documento}`, 10, 10);

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
      startY: 20,
      headStyles: {
        fillColor: [22, 160, 133],
        textColor: 255,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fillColor: [245, 245, 245],
        textColor: [50, 50, 50],
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      styles: {
        fontSize: 10,
        halign: 'center',
      },
    });

    doc.save(`conferencia_${documento}.pdf`);
    alert('Conferência realizada com sucesso!');
  };

  return (
    <main style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Conferência de Pedidos</h1>

      <div style={{ marginBottom: 16 }}>
        <input
          value={documento}
          onChange={e => setDocumento(e.target.value)}
          placeholder="Número do Documento"
          style={{ marginRight: 8 }}
        />
        <button onClick={buscarPedido}>Buscar Pedido</button>
      </div>

      {items.length > 0 && (
        <>
          <div style={{ marginBottom: 20 }}>
            <input
              placeholder="Bipe código ou lote"
              value={bip}
              onChange={e => setBip(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && processarBip(bip)}
              style={{ width: 300 }}
            />
          </div>

          <table border={1} cellPadding={6} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Lote</th>
                <th>Quantidade</th>
                <th>Conferido</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(
                Object.entries(estado).reduce((acc, [key, reg]) => {
                  const lote = key.split('-')[0];
                  const id = `${reg.item}-${lote}`;
                  if (!acc[id]) {
                    acc[id] = { item: reg.item, lote, esperada: 0, conferida: 0 };
                  }
                  acc[id].esperada += reg.esperada;
                  acc[id].conferida += reg.conferida;
                  return acc;
                }, {} as Record<string, { item: string; lote: string; esperada: number; conferida: number }>)
              ).map((reg, idx) => (
                <tr
                  key={idx}
                  style={{ backgroundColor: reg.conferida >= reg.esperada ? '#d4edda' : '#fff3cd' }}
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
            onClick={finalizarConferencia}
            disabled={!todosConferidos}
            style={{ marginTop: 20 }}
          >
            Finalizar Conferência
          </button>
        </>
      )}
    </main>
  );
}
