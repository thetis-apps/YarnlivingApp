/* global axios */

/* global Hammer */

/* global JsBarcode */

// Axios object to access server 

var server = axios.create({
		headers: { "Content-Type": "application/json" },
		baseURL: 'DOCUMENT_API_URL'
// 		baseURL: 'https://2eaclsw0ob.execute-api.eu-west-1.amazonaws.com/Prod' // (Test subscription 379 context 550)
	}); 
	
	
// Add a request interceptor
server.interceptors.request.use(function (config) {
        let blocker = document.getElementById('blocker');	
        blocker.style.display = 'block';
        return config;
    }, function (error) {
        return Promise.reject(error);
    });

// Add a response interceptor
server.interceptors.response.use(function (response) {
        let blocker = document.getElementById('blocker');	
        blocker.style.display = 'none';
        return response;
    }, function (error) {
        return Promise.reject(error);
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

    static async previous(list, lines) {
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
	
                window.alert(response.data.messageText);

        	} else {
        	
        	    let multiPickingList = response.data;

                // Mark all lines as not done
    
                let lines = multiPickingList.shipmentLinesToPack;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].done = false;
                }
    
                if (lines.length == 0) {
                    window.alert('Der er ingen linjer til plukning p?? denne liste.');
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
                await LineToPickState.enter(multiPickingList, lines);
            } else {
                multiPickingList.workStatus = 'DONE';
	            await server.put('/multiPickingLists/' + multiPickingList.id, multiPickingList);
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
	
                window.alert(response.data.messageText);

        	} else {
        	
        	    let putAwayList = response.data;

                // Mark all lines as not done
    
                let lines = putAwayList.globalTradeItemLotsToPutAway;
                for (let i = 0; i < lines.length; i++) {
                    lines[i].done = false;
                }
    
                if (lines.length == 0) {
                    window.alert('Der er ingen beholdninger til indlagring p?? denne liste.');
                } else {
                    lines.sort((a, b) => { 
                            let result;
                            if (a.globalTradeItemLocationNumber != null) { 
                                if (b.globalTradeItemLocationNumber != null) {
                                    result = a.globalTradeItemLocationNumber.localeCompare(b.globalTradeItemLocationNumber);
                                } else {
                                    result = 1;
                                }
                            } else {
                                result = -1;
                            }
                            return result;
                        });
                    putAwayList.index = 0;
					await LineToPutAwayState.enter(putAwayList, lines);
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
            };

        let resumeButton = this.view.querySelector('button[data-action="resume"');
        let putAwayList = Storage.load('PUT_AWAY_LIST');
        if (putAwayList != null) {
    		resumeButton.disabled = false;
        } else {
            resumeButton.disabled = true;
        }
        resumeButton.onclick = async () => {
                let lines = putAwayList.globalTradeItemLotsToPutAway;
                let index = putAwayList.index;
    			if (lines[index].done) {
                    await LinePutAwayState.enter(putAwayList, lines);               
    			} else {
                    await LineToPutAwayState.enter(putAwayList, lines);               
    			}
            };

        bindToTable(table, row, putAwayLists, choose);

    }

}

/**
 * A state related to a replenishment line
 */ 
class PutAwayLineState extends LineState {
    
    static async next(list, lines) {
        if (list.index < lines.length - 1) {
            list.index++;    
			if (lines[list.index].done) {
                await LinePutAwayState.enter(list, lines);               
			} else {
                await LineToPutAwayState.enter(list, lines);               
			}
        }
    }
    
    static async previous(list, lines) {
        if (list.index > 0) {
            list.index--;
			if (lines[list.index].done) {
                await LinePutAwayState.enter(list, lines);               
			} else {
                await LineToPutAwayState.enter(list, lines);               
			}
        }
    }

}

class LineToPutAwayState extends PutAwayLineState {
    
    static async enter(putAwayList, lines) {
        
        await super.enter(putAwayList, lines);
   
        let confirm = async () => {
            
            let line = lines[putAwayList.index];
            line.done = true; 

            // Search for a line that has not yet been placed
            
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
                putAwayList.index = i;
                await LineToPutAwayState.enter(putAwayList, lines);
            } else {
                putAwayList.workStatus = 'DONE';
	            await server.put('/putAwayLists/' + putAwayList.id, putAwayList);
                Storage.clear('PUT_AWAY_LIST');
				await PutAwayListsState.enter();
            }

        };
        
        let confirmButton = this.view.querySelector('button[data-action="confirm"]');
        confirmButton.onclick = confirm;
     
    }
    
}

class LinePutAwayState extends PutAwayLineState {
    
    static async enter(putAwayList, lines) {
        
        await super.enter(putAwayList, lines);
        
        let undo = async () => {
            lines[putAwayList.index].done = false;   
            await LineToPutAwayState.enter(putAwayList, lines);
        };
        
        let undoButton = this.view.querySelector('button[data-action="undo"]');
        undoButton.onclick = undo;
        
    }
    
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
	
                window.alert(response.data.messageText);

        	} else {
        	
        	    let replenishmentList = response.data;

                // Mark all lines as not picked nor packed and set all to be picked from first item lot
    
                let lines = replenishmentList.globalTradeItemsToReplenish;
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    line.picked = false;
                    line.placed = false;
                    line.replenishToExistingLot = true;
                    line.boxNumber = i + 1;
                    let replenishFromLot = line.replenishFromLots[0];
                    line.replenishFromLocationNumber = replenishFromLot.locationNumber;
                    let numItemsNeeded = line.replenishUpToLevel - line.numItemsPickable;

                    // Round down to multipla of 20 or 10
                    
                    let multipla;
                    if (replenishFromLot.numItemsRemaining % 20 == 0) {
                        multipla = 20;
                    } else {
                        multipla = 10;
                    }
                    
                    numItemsNeeded = Math.floor(numItemsNeeded / multipla) * multipla;
                    if (numItemsNeeded == 0) {
                        numItemsNeeded = multipla;
                    }

                    line.numItemsToReplenish = Math.min(replenishFromLot.numItemsRemaining, numItemsNeeded);
                    
                }
                
                if (lines.length == 0) {
                    window.alert('Der er ingen varer til opfyldning p?? denne liste.');
                } else {
                    lines.sort((a, b) => a.replenishFromLocationNumber.localeCompare(b.replenishFromLocationNumber));
                    replenishmentList.index = 0;
					await ReplenishmentLineToPickState.enter(replenishmentList, lines);
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

        let resumeButton = this.view.querySelector('button[data-action="resume"');
        let replenishmentList = Storage.load('REPLENISHMENT_LIST');
        if (replenishmentList != null) {
    		resumeButton.disabled = false;
        } else {
            resumeButton.disabled = true;
        }
        resumeButton.onclick = async () => {
                let lines = replenishmentList.globalTradeItemsToReplenish;
                let index = replenishmentList.index;
    			if (lines[index].placed) {
                    await ReplenishmentLinePlacedState.enter(replenishmentList, lines);               
    			} else if (lines[index].picked) {
    			    await ReplenishmentLineToPlaceState.enter(replenishmentList, lines);
    			} else {
                    await ReplenishmentLineToPickState.enter(replenishmentList, lines);               
    			}
            };

        bindToTable(table, row, putAwayLists, choose);

    }

}

/**
 * A state related to a replenishment line
 */ 
class ReplenishmentLineState extends LineState {
    
    static async next(list, lines) {
        if (list.index < lines.length - 1) {
            list.index++;    
			if (lines[list.index].placed) {
                await ReplenishmentLinePlacedState.enter(list, lines);               
			} else if (lines[list.index].picked) {
                await ReplenishmentLineToPlaceState.enter(list, lines);               
			} else {
                await ReplenishmentLineToPickState.enter(list, lines);               
			}
        }
    }
    
    static async previous(list, lines) {
        if (list.index > 0) {
            list.index--;
			if (lines[list.index].placed) {
                await ReplenishmentLinePlacedState.enter(list, lines);               
			} else if (lines[list.index].picked) {
                await ReplenishmentLineToPlaceState.enter(list, lines);               
			} else {
                await ReplenishmentLineToPickState.enter(list, lines);               
			}
        }
    }

}

/**
 * A state related to a replenishment line that has been picked and placed.
 */ 
class ReplenishmentLinePlacedState extends ReplenishmentLineState {
    
    static enter(replenishmentList, lines) {
        super.enter(replenishmentList, lines);
        
        let undo = async () => {
                lines[replenishmentList.index].placed = false;   
                await ReplenishmentLineToPlaceState.enter(replenishmentList, lines);
            };
        
        let undoButton = this.view.querySelector('button[data-action="undo"]');
        undoButton.onclick = undo;

    }
}

/**
 * A state related to a replenishment line that has been picked but not yet placed.
 */ 
class ReplenishmentLineToPlaceState extends ReplenishmentLineState {
    
    static async enter(replenishmentList, lines) {
        
        await super.enter(replenishmentList, lines);

        let confirm = async () => {
            
            let line = lines[replenishmentList.index];
            line.placed = true; 

            // Search for a line that has not yet been placed
            
            let i = 0;
            let found = false;
            while (i < lines.length && !found) {
                let line = lines[i];
                if (!line.placed) {
                    found = true;
                } else {
                    i++;
                }
            }
        
            if (found) {
                replenishmentList.index = i;
                await ReplenishmentLineToPlaceState.enter(replenishmentList, lines);
            } else {
                
                // Search for a line not yet picked                
 
                lines.sort((a, b) => a.replenishFromLocationNumber.localeCompare(b.replenishFromLocationNumber));
               
                i = 0;
                found = false;
                while (i < lines.length && !found) {
                    let line = lines[i];
                    if (!line.picked) {
                        found = true;
                    } else {
                        i++;
                    }
                }
                
                if (found) {
                    replenishmentList.index = i;
                    await ReplenishmentLineToPickState.enter(replenishmentList, lines);
                } else {
                    replenishmentList.workStatus = 'DONE';
    	            await server.put('/replenishmentLists/' + replenishmentList.id, replenishmentList);
                    Storage.clear('REPLENISHMENT_LIST');
    				await ReplenishmentListsState.enter();
                }
            }                

        };
        
        let confirmButton = this.view.querySelector('button[data-action="confirm"]');
        confirmButton.onclick = confirm;
        
        let undo = async () => {
                lines[replenishmentList.index].picked = false;   
                ReplenishmentLineToPickState.enter(replenishmentList, lines);
            };
        
        let undoButton = this.view.querySelector('button[data-action="undo"]');
        undoButton.onclick = undo;


    }
}

/**
 * A state related to a replenishment line that has not yet been picked.
 */ 
class ReplenishmentLineToPickState extends ReplenishmentLineState {
    
    static async enter(replenishmentList, lines) {
        
        await super.enter(replenishmentList, lines);

        let confirm = async () => {
            
            let line = lines[replenishmentList.index];
            line.picked = true; 

            let replenishFromLot = line.replenishFromLots[0];
            replenishFromLot.numItemsReplenished = Math.min(line.numItemsToReplenish, replenishFromLot.numItemsRemaining);

            // Search for a line that has not yet been picked

            let i = 0;
            let found = false;
            while (i < lines.length && !found) {
                let line = lines[i];
                if (!line.picked) {
                    found = true;
                } else {
                    i++;
                }
            }
            
            if (found) {
                replenishmentList.index = i;
                await ReplenishmentLineToPickState.enter(replenishmentList, lines);
            } else {
                
                lines.sort((a, b) => a.locationNumber.localeCompare(b.locationNumber));
                
                // Search for a line that has not yet been placed
                
                i = 0;
                found = false;
                while (i < lines.length && !found) {
                    let line = lines[i];
                    if (!line.placed) {
                        found = true;
                    } else {
                        i++;
                    }
                }
            
                if (found) {
                    replenishmentList.index = i;
                    await ReplenishmentLineToPlaceState.enter(replenishmentList, lines);
                } else {
                    throw Error("Just picked a line!");
                }                
            }
            
        };
        
        let confirmButton = this.view.querySelector('button[data-action="confirm"]');
        confirmButton.onclick = confirm;

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
    }
    
    static async start() {
        await StartState.enter();
    }
}


