/* global axios */

/* global Hammer */

/* global JsBarcode */

// Axios object to access server 

var server = axios.create({
		headers: { "Content-Type": "application/json" },
		baseURL: 'DOCUMENT_API_URL' // 'https://2eaclsw0ob.execute-api.eu-west-1.amazonaws.com/Prod' (Test subscription 379 context 550)
	}); 
	
function bind(element, datum) {
    
    let elements = element.querySelectorAll('div[data-field-name]');
    for (let element of elements) {
        element.innerHTML = '';
    }
    
    for (let fieldName in datum) {
        let value = datum[fieldName];
        if (typeof value === 'object') {
            for (let nestedFieldName in value) {
                let field = element.querySelector('[data-field-name="' + fieldName + '.' + nestedFieldName + '"]');
                if (field != null) {
                    field.innerHTML = value[nestedFieldName];
                }
            }            
        } else {
            let field = element.querySelector('[data-field-name="' + fieldName + '"]');
            if (field != null) {
                if (value != null) {
                    field.innerHTML = value;
                } else {
                    field.innerHTML = '';
                }
            } 
        }
    }
} 

function bindToTable(table, template, data, onclick) {
    
    // Remove rows from the table
    
    while (table.firstChild) {
        table.removeChild(table.lastChild);
    }
    
    // Insert new rows into the table
    
    for (let i = 0; i < data.length; i++) {
        let datum = data[i];
        let row = template.cloneNode(true);
        row.classList.remove('template');        
        bind(row, datum);
        table.appendChild(row);
        row.onclick = () => {
            onclick(datum);
        };
    }
}

/**
 * Top level state
 */
class State {
    
    static init(view) {
        this.view = view;
    }
    
    static async enter() {
		let old = document.querySelector('div.view[current]');
		if (old != null) {
			old.style.display = 'none';
			old.removeAttribute('current');
		}
		this.view.style.display = 'block';
		this.view.setAttribute('current', 'true');		
    }

}

/**
 * A state related to a line in an array that offers browsing back and forth.
 */
class LineState extends State {
    
    static async next(list, lines) {
        console.log("You must implement next method.");
    }

    static async next(list, lines) {
        console.log("You must implement previous method.");
    }
    
    static async enter(list, lines) {

		await super.enter();        
		
		Storage.persist(list.documentType, list);

		let line = lines[list.index];
        bind(this.view, line);
        
		let optionsPanel = this.view.querySelector('#optionsPanel');
		optionsPanel.style.display = 'none';

        let next = async (e) => {
			e.preventDefault();
			await this.next(list, lines);
        };
        
        let previous = async (e) => {
			e.preventDefault();
			await this.previous(list, lines);
        };
        
        let hammer = new Hammer(this.view, { taps: 2 });
        hammer.on("swipeleft", next);
        hammer.on("swiperight", previous);

        let previousButton = this.view.querySelector('button[data-action="previous"]');
        if (list.index > 0) {     
    		previousButton.disabled = false;
    		previousButton.onclick = previous;
        } else {
            previousButton.disabled = true;
        }
		
        let nextButton = this.view.querySelector('button[data-action="next"]');
        if (list.index < lines.length - 1) {
    		nextButton.disabled = false;
    		nextButton.onclick = next;
        } else {
            nextButton.disabled = true;
        }

		let optionsButton = this.view.querySelector('button[data-action="options"]');
		optionsButton.onclick = () => {
			if (optionsPanel.style.display == 'none') {
				optionsPanel.style.display = 'block';
			} else {
				optionsPanel.style.display = 'none';
			}
		};
		
		let pauseButton = this.view.querySelector('button[data-action="pause"]');
        pauseButton.onclick = async () => {
            StartState.enter();
        };
		
		this.view.querySelector('#lineIndexField').innerHTML = list.index + 1;
		this.view.querySelector('#lineCountField').innerHTML = lines.length;

    }    
        
}

/**
 * Storing of objects in local storage
 */ 
class Storage {
    
    static persist(key, object) {
        window.localStorage.setItem(key, JSON.stringify(object));            
    }
    
    static load(key) {
		let s = window.localStorage.getItem(key);
		if (s == null) {
			return null;	
		}
        return JSON.parse(s);
    }

	static clear(key) {
		window.localStorage.removeItem(key);
	}
}

/**
 * State showing pending picking lists for the user to choose.
 */ 
class PickingListsState extends State {
    
    static async enter() {
	
		await super.enter();
	        
        let response = await server.get('/pendingMultiPickingLists');
        let pickingLists = response.data;

        let table = this.view.querySelector('.table[data-table-name="pickingListTable"]');
        let row = this.view.querySelector('.table-row.template[data-table-name="pickingListTable"]');
        
        let choose = async (pickingList) => {
            
            pickingList.workStatus = 'ON_GOING';
            let response = await server.put('/multiPickingLists/' + pickingList.id, pickingList, { validateStatus: function (status) {
        		    return status == 200 || status == 422; 
        		}});
        	
        	if (response.status == 422) {
	
        	    await ErrorState.enter('pickingListLocked');
        	
        	} else {
        	
        	    let multiPickingList = response.data;

                // Mark all lines as not done
    
                let lines = multiPickingList.shipmentLinesToPack;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].done = false;
                }
    
                if (lines.length == 0) {
                    await ErrorState.enter('noLinesToPick');
                } else {
                    multiPickingList.index = 0;
    				await LineToPickState.enter(multiPickingList, lines, 0);
                }
                
        	}
        };
        
        let refreshButton = this.view.querySelector('button[data-action="refresh"');
        refreshButton.onclick = async () => {
                await PickingListsState.enter();            
            };

        let menuButton = this.view.querySelector('button[data-action="menu"');
        menuButton.onclick = async () => {
                await StartState.enter();
            };

        let resumeButton = this.view.querySelector('button[data-action="resume"');
        let multiPickingList = Storage.load('MULTI_PICKING_LIST');
        if (multiPickingList != null) {
    		resumeButton.disabled = false;
        } else {
            resumeButton.disabled = true;
        }
        resumeButton.onclick = async () => {
                let lines = multiPickingList.shipmentLinesToPack;
                let index = multiPickingList.index;
    			if (lines[index].done) {
                    await LinePickedState.enter(multiPickingList, lines, index);               
    			} else {
                    await LineToPickState.enter(multiPickingList, lines, index);               
    			}
            };

        bindToTable(table, row, pickingLists, choose);

    }

}

/**
 * A picking line
 */ 
class PickLineState extends LineState {
    
    static async next(multiPickingList, lines) {
        if (multiPickingList.index < lines.length - 1) {
			multiPickingList.index++;
			if (lines[multiPickingList.index].done) {
                await LinePickedState.enter(multiPickingList, lines);               
			} else {
                await LineToPickState.enter(multiPickingList, lines);               
			}
        }
    }
    
    static async previous(multiPickingList, lines, index) {
        if (multiPickingList.index > 0) {
            multiPickingList.index--;
			if (lines[multiPickingList.index].done) {
				await LinePickedState.enter(multiPickingList, lines);	
			} else {
                await LineToPickState.enter(multiPickingList, lines);
			}
        }
    }

}

/**
 * Showing line that has already been picked.
 */ 
class LinePickedState extends PickLineState {

    static async enter(multiPickingList, lines) {
        
        await super.enter(multiPickingList, lines);

        let undo = async () => {
            lines[multiPickingList.index].done = false;   
            LineToPickState.enter(multiPickingList, lines);
        };
        
        let undoButton = this.view.querySelector('button[data-action="undo"]');
        undoButton.onclick = undo;

    }
    
}

/**
 * Showing line to pick.
 */ 
class LineToPickState extends PickLineState {
    
    static async enter(multiPickingList, lines) {
        
        await super.enter(multiPickingList, lines);

        let confirm = async () => {
        
            lines[multiPickingList.index].done = true; 

            let i = 0;
            let found = false;
            while (i < lines.length && !found) {
                let line = lines[i];
                if (!line.done) {
                    found = true;
                } else {
                    i++;
                }
            }
            
            if (found) {
                multiPickingList.index = i;
                LineToPickState.enter(multiPickingList, lines);
            } else {
                multiPickingList.workStatus = 'DONE';
	            await server.put('/multiPickingLists/' + multiPickingList.id, multiPickingList, JSON.stringify('DONE'));
                Storage.clear('MULTI_PICKING_LIST');
				await PickingListsState.enter();
            }
            
        };
        
        let postpone = async () => {
            let postponedLines = lines.splice(multiPickingList.index, 1);
            lines.push(postponedLines[0]);
            
            let i = 0;
            let found = false;
            while (i < lines.length && !found) {
                let line = lines[i];
                if (!line.done) {
                    found = true;
                } else {
                    i++;
                }
            }
    
            LineToPickState.enter(multiPickingList, lines, i);
        };
        
        let confirmButton = this.view.querySelector('button[data-action="confirm"]');
        confirmButton.onclick = confirm;

        let postponeButton = this.view.querySelector('button[data-action="postpone"]');
        postponeButton.onclick = postpone;
        
        JsBarcode("#barcode").EAN13(lines[multiPickingList.index].globalTradeItemNumber, {fontSize: 18, textMargin: 0}).render();

    }
}

/**
 * Showing an error message 
 */ 
class ErrorState extends State {
    
    static async enter(error) {
	
		super.enter();
	
        let errorMessage = this.view.querySelector('[data-error="' + error + '"]'); 
        errorMessage.style.display = 'block';
        
        let acknowledgeButton = this.view.querySelector('button[data-action="acknowledge"]');
        acknowledgeButton.onclick = () => {
                errorMessage.style.display = 'none';
                PickingListsState.enter();
            }; 
    }
}

/**
 * Showing pending put-away lists to choose from
 */ 
class PutAwayListsState extends State {
    
    static async enter() {
	
		await super.enter();
	        
        let response = await server.get('/pendingPutAwayLists');
        let putAwayLists = response.data;

        let table = this.view.querySelector('.table[data-table-name="putAwayListTable"]');
        let row = this.view.querySelector('.table-row.template[data-table-name="putAwayListTable"]');
        
        let choose = async (putAwayList) => {
            
            putAwayList.workStatus = 'ON_GOING';
            let response = await server.put('/putAwayLists/' + putAwayList.id, putAwayList, { validateStatus: function (status) {
        		    return status == 200 || status == 422; 
        		}});
        	
        	if (response.status == 422) {
	
        	    await ErrorState.enter('putAwayListLocked');
        	
        	} else {
        	
        	    let putAwayList = response.data;

                // Mark all lines as not done
    
                let lines = putAwayList.globalTradeItemLotsToPutAway;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].done = false;
                }
    
                if (lines.length == 0) {
                    await ErrorState.enter('noLinesToPutAway');
                } else {
					await LineToPutAwayState.enter(putAwayList.id, lines, 0);
                }
                
        	}
        };
        
        let refreshButton = this.view.querySelector('button[data-action="refresh"');
        refreshButton.onclick = async () => {
                await PutAwayListsState.enter();            
            };

        let menuButton = this.view.querySelector('button[data-action="menu"');
        menuButton.onclick = async () => {
                await StartState.enter();
            }


        bindToTable(table, row, putAwayLists, choose);

    }

}

class LineToPutAwayState extends State {
    
    static enter() {};
    
}

class LinePutAwayState extends State {
    
    static enter() {};
    
}

/**
 * Showing pending replenishment lists to choose from
 */ 
class ReplenishmentListsState extends State {
    
    static async enter() {
	
		await super.enter();
	        
        let response = await server.get('/pendingReplenishmentLists');
        let putAwayLists = response.data;

        let table = this.view.querySelector('.table[data-table-name="replenishmentListTable"]');
        let row = this.view.querySelector('.table-row.template[data-table-name="replenishmentListTable"]');
        
        let choose = async (replenishmentList) => {
            
            replenishmentList.workStatus = 'ON_GOING';
            let response = await server.put('/replenishmentLists/' + replenishmentList.id, replenishmentList, { validateStatus: function (status) {
        		    return status == 200 || status == 422; 
        		}});
        	
        	if (response.status == 422) {
	
        	    await ErrorState.enter('replenishmentListLocked');
        	
        	} else {
        	
        	    let replenishmentList = response.data;

                // Mark all lines as not done
    
                let lines = replenishmentList.globalTradeItemsToReplenish;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].picked = false;
                    lines[i].placed = false;
                }
    
                if (lines.length == 0) {
                    await ErrorState.enter('noLinesToReplenish');
                } else {
//					await LineToPutAwayState.enter(replenishmentList.id, lines, 0);
                }
                
        	}
        };
        
        let refreshButton = this.view.querySelector('button[data-action="refresh"');
        refreshButton.onclick = async () => {
                await ReplenishmentListsState.enter();            
            };

        let menuButton = this.view.querySelector('button[data-action="menu"');
        menuButton.onclick = async () => {
                await StartState.enter();
            };


        bindToTable(table, row, putAwayLists, choose);

    }

}

/**
 * A state related to a replenishment line
 */ 
class ReplenishmentLineState extends LineState {
    
    static async next(id, lines, index) {
        if (index < lines.length - 1) {
			if (lines[index + 1].placed) {
                ReplenishmentLinePlacedState.enter(id, lines, index + 1);               
			} else if (lines[index + 1].picked) {
                ReplenishmentLineToPlaceState.enter(id, lines, index + 1);               
			} else {
                ReplenishmentLineToPickState.enter(id, lines, index + 1);               
			}
        }
    }
    
    static async previous(id, lines, index) {
        if (index > 0) {
			if (lines[index - 1].placed) {
                ReplenishmentLinePlacedState.enter(id, lines, index + 1);               
			} else if (lines[index - 1].picked) {
                ReplenishmentLineToPlaceState.enter(id, lines, index + 1);               
			} else {
                ReplenishmentLineToPickState.enter(id, lines, index + 1);               
			}
        }
    }

}

/**
 * A state related to a replenishment line that has been picked and placed.
 */ 
class ReplenishmentLinePlacedState extends ReplenishmentLineState {
    
    static enter(replenishmentListId, lines, index) {
        super.enter(replenishmentListId, lines, index);
    }
}

/**
 * A state related to a replenishment line that has been picked but not yet placed.
 */ 
class ReplenishmentLineToPlaceState extends ReplenishmentLineState {
    
    static enter(replenishmentListId, lines, index) {
        super.enter(replenishmentListId, lines, index);
    }
}

/**
 * A state related to a replenishment line that has not yet been picked.
 */ 
class ReplenishmentLineToPickState extends ReplenishmentLineState {
    
    static enter(replenishmentListId, lines, index) {
        super.enter(replenishmentListId, lines, index);
    }
}

/**
 * Show start view
 */ 
class StartState extends State {
    
    static async enter() {
        await super.enter();
        let pickingButton = this.view.querySelector('button[data-action="picking"');
        pickingButton.onclick = async () => {
                await PickingListsState.enter();           
            };
        let putAwayButton = this.view.querySelector('button[data-action="putAway"');
        putAwayButton.onclick = async () => {
                await PutAwayListsState.enter();           
            };
        let replenishmentButton = this.view.querySelector('button[data-action="replenishment"');
        replenishmentButton.onclick = async () => {
                await ReplenishmentListsState.enter();           
            };
        
    }
}

/**
 * The app itself.
 */ 
class App {
    
    static init(views) {
        StartState.init(views[0]);
        PickingListsState.init(views[1]);
        LineToPickState.init(views[2]);
        LinePickedState.init(views[3]);
        PutAwayListsState.init(views[4]);
        LineToPutAwayState.init(views[5]);
        LinePutAwayState.init(views[6]);
        ReplenishmentListsState.init(views[7]);
        ReplenishmentLineToPickState.init(views[8]);
        ReplenishmentLineToPlaceState.init(views[9]);
        ReplenishmentLinePlacedState.init(views[10]);
        ErrorState.init(views[11]);
    }
    
    static async start() {
        await StartState.enter();
    }
}


